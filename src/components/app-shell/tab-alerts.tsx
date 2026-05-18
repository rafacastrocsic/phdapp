"use client";
import { useEffect, useRef } from "react";

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
  const audioCtx = useRef<AudioContext | null>(null);

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

    function beep() {
      try {
        if (
          typeof window === "undefined" ||
          window.localStorage.getItem("phdapp.muteChat") === "1"
        )
          return;
        const Ctor =
          window.AudioContext ||
          (window as unknown as { webkitAudioContext?: typeof AudioContext })
            .webkitAudioContext;
        if (!Ctor) return;
        if (!audioCtx.current) audioCtx.current = new Ctor();
        const ctx = audioCtx.current;
        if (ctx.state === "suspended") ctx.resume().catch(() => {});
        const t = ctx.currentTime;
        const play = (freq: number, start: number, dur: number) => {
          const o = ctx.createOscillator();
          const g = ctx.createGain();
          o.type = "sine";
          o.frequency.value = freq;
          g.gain.setValueAtTime(0.0001, t + start);
          g.gain.exponentialRampToValueAtTime(0.15, t + start + 0.02);
          g.gain.exponentialRampToValueAtTime(0.0001, t + start + dur);
          o.connect(g);
          g.connect(ctx.destination);
          o.start(t + start);
          o.stop(t + start + dur);
        };
        play(660, 0, 0.15);
        play(880, 0.16, 0.2);
      } catch {
        // audio blocked until a user gesture — ignore
      }
    }

    function apply(count: number, sender: string | null) {
      document.title =
        count > 0
          ? `(${count}) ${
              sender ? `${sender} messaged you` : "New message"
            } – ${baseTitle.current}`
          : baseTitle.current;
      if (count > 0) {
        const url = drawFavicon(count);
        if (url) setFavicon(url);
      } else {
        const injected = document.getElementById("phdapp-fav");
        if (injected) injected.remove();
        // restore originals (their href is unchanged, nothing else needed)
      }
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
