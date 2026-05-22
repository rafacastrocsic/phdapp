"use client";
import { useEffect, useRef } from "react";
import { playChatSound } from "@/lib/chat-sound";
import { useUnread } from "@/components/app-shell/unread-provider";

/**
 * Browser-tab awareness for new chat messages:
 *  - document title → "(N) X messaged you – PhDapp" when unread > 0
 *  - favicon gets a red badge with the unread count
 *  - a short sound when the unread count rises (mutable via
 *    localStorage key "phdapp.muteChat" = "1")
 * Renders nothing; mounted once in the app shell.
 *
 * Reads from UnreadProvider — does not poll on its own. The provider
 * runs a single 20s poll for the entire app; this component just
 * reacts to changes in `data.chat.count` and re-draws the title +
 * favicon.
 */
export function TabAlerts() {
  const baseTitle = useRef<string>("PhDapp · Supervision Hub");
  const prevCount = useRef<number | null>(null);
  const origFavicons = useRef<{ el: HTMLLinkElement; href: string }[]>([]);
  const setupRef = useRef(false);

  const { data } = useUnread();

  // One-time setup on mount: capture base title, snapshot existing
  // favicons. No polling here — that's the provider's job now.
  useEffect(() => {
    if (typeof document !== "undefined" && document.title)
      baseTitle.current = document.title;
    origFavicons.current = Array.from(
      document.querySelectorAll<HTMLLinkElement>('link[rel~="icon"]'),
    ).map((el) => ({ el, href: el.href }));
    setupRef.current = true;
    return () => {
      document.title = baseTitle.current;
      const injected = document.getElementById("phdapp-fav");
      if (injected) injected.remove();
    };
  }, []);

  // React to chat-count changes from the provider.
  useEffect(() => {
    if (!setupRef.current) return;
    const count = data?.chat?.count ?? 0;
    const sender = data?.chat?.latestSender ?? null;
    if (prevCount.current !== null && count > prevCount.current) {
      playChatSound();
    }
    prevCount.current = count;
    apply(count, sender);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data?.chat?.count, data?.chat?.latestSender]);

  return null;
}

function drawFavicon(count: number): string | null {
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
  let link = document.getElementById("phdapp-fav") as HTMLLinkElement | null;
  if (!link) {
    link = document.createElement("link");
    link.id = "phdapp-fav";
    link.rel = "icon";
    document.head.appendChild(link);
  }
  link.href = dataUrl;
}

function apply(count: number, sender: string | null) {
  const baseTitle =
    document.title.replace(/^\(\d+\)\s+.+?\s+–\s+/, "") || "PhDapp · Supervision Hub";
  document.title =
    count > 0
      ? `(${count}) ${
          sender ? `${sender} messaged you` : "New message"
        } – ${baseTitle}`
      : baseTitle;
  const url = drawFavicon(count);
  if (url) setFavicon(url);
}
