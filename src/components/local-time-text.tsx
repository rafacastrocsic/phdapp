"use client";
import { useEffect, useState, Fragment } from "react";
import { format } from "date-fns";

/**
 * Render a string that may contain ISO-time **markers** like
 *   "scheduled event 'Foo' on [[2026-05-20T09:00:00.000Z]]"
 * and replace each marker with the timestamp formatted in the viewer's
 * timezone. This is what makes the 🔔 bell and the activity log show
 * "11:00" for a Madrid viewer of a 09:00 UTC event.
 *
 * If there are no markers, the string is returned as-is.
 *
 * Default format is "MMM d, HH:mm". Pass `fmt` to override.
 *
 * Server components store the ISO inside the marker; this component runs
 * client-side, so it knows the user's local zone. Renders a stable
 * placeholder until mounted to stay hydration-safe.
 */
const RE = /\[\[(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?Z)\]\]/g;

export function LocalTimeText({
  text,
  fmt = "MMM d, HH:mm",
}: {
  text: string;
  fmt?: string;
}) {
  // Pre-split for stable hydration. Server renders raw markers (or
  // empty placeholders) so React doesn't shout about mismatched output.
  const parts: Array<{ kind: "text" | "iso"; value: string }> = [];
  let last = 0;
  for (const m of text.matchAll(RE)) {
    const idx = m.index ?? 0;
    if (idx > last) parts.push({ kind: "text", value: text.slice(last, idx) });
    parts.push({ kind: "iso", value: m[1] });
    last = idx + m[0].length;
  }
  if (last < text.length) parts.push({ kind: "text", value: text.slice(last) });

  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  return (
    <Fragment>
      {parts.map((p, i) => {
        if (p.kind === "text") return <Fragment key={i}>{p.value}</Fragment>;
        if (!mounted) return <Fragment key={i}>…</Fragment>;
        const d = new Date(p.value);
        return (
          <Fragment key={i}>
            {Number.isNaN(d.getTime()) ? p.value : format(d, fmt)}
          </Fragment>
        );
      })}
    </Fragment>
  );
}
