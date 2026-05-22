"use client";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from "react";

// Shape returned by GET /api/unread (see src/app/api/unread/route.ts).
//
// Every section carries:
//   - count: how many unread items in that section (for the sidebar
//     badges and tab-title);
//   - version: ISO timestamp of the most recent peer-driven change
//     visible to the user. Pages compare this against a
//     remembered `lastSeenVersion` to decide whether to refetch
//     their full data. Self-changes don't bump the version, so a
//     user's own optimistic updates don't ricochet into refetches.
//
// Section-specific extras (byChannel, ticketIds, highlightByEvent,
// latestSender) are passed through unchanged.
export interface UnreadData {
  chat: {
    count: number;
    byChannel: Record<string, number>;
    latestSender: string | null;
    version: string | null;
  };
  kanban: {
    count: number;
    ticketIds: string[];
    version: string | null;
  };
  calendar: {
    count: number;
    highlightByEvent: Record<string, "new" | "updated">;
    version: string | null;
  };
  reading: { count: number; version: string | null };
  team: { count: number; version: string | null };
  feedback: { count: number; version: string | null };
  serverNow?: string;
}

// `data` is null until the first successful poll resolves; consumers
// should treat null as "I don't know yet" rather than "everything is
// zero". The provider also exposes `refresh()` for explicit refresh
// after the user takes an action that should reflect immediately.
interface UnreadContextValue {
  data: UnreadData | null;
  refresh: () => Promise<void>;
}

const UnreadContext = createContext<UnreadContextValue>({
  data: null,
  refresh: async () => {},
});

// Polling cadence. 20s is the sweet spot — slow enough to be cheap
// (3 invocations/minute even with everything open), fast enough that
// notifications feel timely. Page-level views are version-gated and
// will only do their own full fetch when the version moves, so the
// effective freshness depends on this cadence plus the gate.
const POLL_INTERVAL_MS = 20_000;

/**
 * Single shared poller for /api/unread. Mounted once at the (app)
 * layout level. Replaces the three independent fetch loops that used
 * to live in sidebar.tsx, tab-alerts.tsx, and chat-view.tsx —
 * collapsing 3+ /api/unread invocations per poll-cycle into one.
 *
 * Behavior:
 *  - Polls on a 20s interval while the tab is visible.
 *  - Pauses when document.visibilityState === "hidden".
 *  - On returning to visibility, refreshes immediately, then resumes.
 *  - Exposes `refresh()` so consumers can re-pull right after
 *    explicit actions (e.g. opening a channel — mark-read happens,
 *    then refresh ensures the badge count drops without waiting up
 *    to 20s for the next tick).
 */
export function UnreadProvider({ children }: { children: React.ReactNode }) {
  const [data, setData] = useState<UnreadData | null>(null);
  // Track in-flight fetches so explicit refresh() calls don't
  // pile up if invoked rapidly.
  const fetchingRef = useRef(false);

  const fetchNow = useCallback(async () => {
    if (fetchingRef.current) return;
    fetchingRef.current = true;
    try {
      const r = await fetch("/api/unread", { cache: "no-store" });
      if (r.ok) {
        const j = (await r.json()) as UnreadData;
        setData(j);
      }
    } catch {
      // transient — keep last good `data`
    } finally {
      fetchingRef.current = false;
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | null = null;

    async function tick() {
      if (cancelled) return;
      if (
        typeof document !== "undefined" &&
        document.visibilityState === "hidden"
      ) {
        // Paused — visibilitychange handler will re-fire tick().
        return;
      }
      await fetchNow();
      if (!cancelled) timer = setTimeout(tick, POLL_INTERVAL_MS);
    }

    function onVisibility() {
      if (typeof document === "undefined") return;
      if (document.visibilityState === "hidden") {
        if (timer) {
          clearTimeout(timer);
          timer = null;
        }
      } else {
        // Returning to the tab — refresh immediately then resume.
        if (timer) clearTimeout(timer);
        tick();
      }
    }

    if (
      typeof document === "undefined" ||
      document.visibilityState !== "hidden"
    ) {
      tick();
    }
    if (typeof document !== "undefined") {
      document.addEventListener("visibilitychange", onVisibility);
    }

    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
      if (typeof document !== "undefined") {
        document.removeEventListener("visibilitychange", onVisibility);
      }
    };
  }, [fetchNow]);

  return (
    <UnreadContext.Provider value={{ data, refresh: fetchNow }}>
      {children}
    </UnreadContext.Provider>
  );
}

/** Full unread blob + explicit refresh. */
export function useUnread() {
  return useContext(UnreadContext);
}

/**
 * Reactive subscription to a single section's version timestamp.
 * Returns null until the first poll resolves or if the section has
 * never seen a peer-driven change. Pages use this as a polling gate:
 *
 *     const version = useSectionVersion("calendar");
 *     const lastSeenRef = useRef<string | null>(null);
 *     useEffect(() => {
 *       if (version === null) return;
 *       if (lastSeenRef.current === version) return;
 *       lastSeenRef.current = version;
 *       refetchEvents();
 *     }, [version]);
 *
 * No need to set up your own setInterval. The provider's single poll
 * drives every page's freshness.
 */
export function useSectionVersion(
  section: "chat" | "kanban" | "calendar" | "reading" | "team" | "feedback",
): string | null {
  const { data } = useUnread();
  return data?.[section]?.version ?? null;
}
