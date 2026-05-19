"use client";
import { useEffect, useState } from "react";
import { format } from "date-fns";

/**
 * Render an absolute timestamp in the **viewer's** timezone (date-fns
 * `format`, browser-local) so server-rendered times match what the
 * Calendar shows. Server components otherwise format in the server's
 * zone (UTC on Vercel), which made event times look inconsistent.
 *
 * Renders a placeholder until mounted to stay hydration-safe.
 */
export function LocalTime({ iso, fmt }: { iso: string; fmt: string }) {
  const [text, setText] = useState<string>("");
  useEffect(() => {
    const d = new Date(iso);
    setText(Number.isNaN(d.getTime()) ? "" : format(d, fmt));
  }, [iso, fmt]);
  return <span suppressHydrationWarning>{text || "…"}</span>;
}
