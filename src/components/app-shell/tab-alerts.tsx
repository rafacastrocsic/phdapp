"use client";
import { useEffect, useRef } from "react";
import { playChatSound } from "@/lib/chat-sound";

/**
 * Browser-tab awareness for new chat messages (Bruno's suggestion):
 *  - document title → "(N) X messaged you – PhDapp" when unread > 0
 *  - favicon gets a red badge with the unread count
 *  - a short sound when the unread count rises (mutable via localStorage
 *    key "phdapp.muteChat" = "1")
 * Renders nothing; mounted once in the app shell.
 */
export function TabAlerts() {
  const baseTitle = useRef<string>("PhDapp · Supervision Hub");
  const prevCount = useRef<number | null>(null);
  const origFavicons = useRef<{ el: HTMLLinkElement; href: string }[]>([]);

  useEffect(() => {
    if (typeof document !== "undefined" && document.title)
      baseTitle.current = document.title;
    // Snapshot any existing favicon links so we can restore them at count 0.
    origFavicons.current = Array.from(
      document.querySelectorAll<HTMLLinkElement>('link[rel~="icon"]'),
    ).map((el) => ({ el, href: el.href }));

    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | null = null;

    function drawFavicon(count: number) {
      const c = document.createElement("canvas");
      c.width = 64;
      c.height = 64;
      const x = c.getContext("2d");
      if (!x) return null;
      // Brand tile.
      x.fillStyle = "#6f4cff";
      const r = 14;
      x.beginPath();
      x.moveTo(r, 0);
      x.arcTo(64, 0, 64, 64, r);
      x.arcTo(64, 64, 0, 64, r);
      x.arcTo(0, 64, 0, 0, r);
      x.arcTo(0, 0, 64, 0, r);
      x.closePath();
      x.fill();
      // Simple 4-point sparkle (echoes the in-app logo).
      x.fillStyle = "#ffffff";
      x.beginPath();
      const cx = 30;
      const cy = 32;
      x.moveTo(cx, cy - 16);
      x.quadraticCurveTo(cx + 3, cy - 3, cx + 16, cy);
      x.quadraticCurveTo(cx + 3, cy + 3, cx, cy + 16);
      x.quadraticCurveTo(cx - 3, cy + 3, cx - 16, cy);
      x.quadraticCurveTo(cx - 3, cy - 3, cx, cy - 16);
      x.fill();
      if (count > 0) {
        x.fillStyle = "#e2445c";
        x.beginPath();
        x.arc(47, 17, 17, 0, Math.PI * 2);
        x.fill();
        x.fillStyle = "#ffffff";
        x.font = "bold 26px sans-serif";
        x.textAlign = "center";
        x.textBaseline = "middle";
        x.fillText(count > 9 ? "9+" : String(count), 47, 18);
      }
      return c.toDataURL("image/png");
    }

    function setFavicon(dataUrl: string) {
      let link = document.getElementById(
        "phdapp-fav",
      ) as HTMLLinkElement | null;
      if (!link) {
        link = document.createElement("link");
        link.id = "phdapp-fav";
        link.rel = "icon";
        document.head.appendChild(link);
      }
      link.href = dataUrl;
    }

    const beep = () => playChatSound();

    function apply(count: number, sender: string | null) {
      document.title =
        count > 0
          ? `(${count}) ${
              sender ? `${sender} messaged you` : "New message"
            } – ${baseTitle.current}`
          : baseTitle.current;
      // Always keep a favicon — draw the brand tile (badge only when
      // there are unreads). Removing the link left the tab with no icon.
      const url = drawFavicon(count);
      if (url) setFavicon(url);
    }

    async function tick() {
      try {
        const r = await fetch("/api/chat/unread", { cache: "no-store" });
        if (!cancelled && r.ok) {
          const j = await r.json();
          const count: number = j.count ?? 0;
          const sender: string | null = j.latestSender ?? null;
          if (
            prevCount.current !== null &&
            count > prevCount.current
          )
            beep();
          prevCount.current = count;
          apply(count, sender);
        }
      } catch {
        // transient — ignore
      }
      if (!cancelled) timer = setTimeout(tick, 5000);
    }
    tick();

    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
      document.title = baseTitle.current;
      const injected = document.getElementById("phdapp-fav");
      if (injected) injected.remove();
    };
  }, []);

  return null;
}
