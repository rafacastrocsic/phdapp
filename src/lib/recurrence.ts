import { addDays, addWeeks, addMonths } from "date-fns";

export type RecurFreq = "none" | "daily" | "weekly" | "monthly";

/**
 * Build an iCal RRULE body (no "RRULE:" prefix) from the simple MVP picker.
 * Returns null for "none". `until` is a yyyy-mm-dd date string (inclusive).
 */
export function buildRRule(
  freq: RecurFreq,
  interval: number,
  until: string | null,
): string | null {
  if (freq === "none") return null;
  const f =
    freq === "daily" ? "DAILY" : freq === "weekly" ? "WEEKLY" : "MONTHLY";
  const parts = [`FREQ=${f}`, `INTERVAL=${Math.max(1, interval || 1)}`];
  if (until) {
    // End of that day, UTC.
    const u = until.replace(/-/g, "");
    parts.push(`UNTIL=${u}T235959Z`);
  }
  return parts.join(";");
}

/** Parse the MVP subset back out of an RRULE body (for the edit dialog). */
export function parseRRule(rule: string | null): {
  freq: RecurFreq;
  interval: number;
  until: string | null;
} {
  if (!rule) return { freq: "none", interval: 1, until: null };
  const map = new Map(
    rule.split(";").map((p) => {
      const [k, v] = p.split("=");
      return [k, v] as const;
    }),
  );
  const f = map.get("FREQ");
  const freq: RecurFreq =
    f === "DAILY" ? "daily" : f === "WEEKLY" ? "weekly" : f === "MONTHLY" ? "monthly" : "none";
  const interval = parseInt(map.get("INTERVAL") ?? "1", 10) || 1;
  const u = map.get("UNTIL");
  const until = u ? `${u.slice(0, 4)}-${u.slice(4, 6)}-${u.slice(6, 8)}` : null;
  return { freq, interval, until };
}

function step(d: Date, freq: RecurFreq, interval: number): Date {
  if (freq === "daily") return addDays(d, interval);
  if (freq === "weekly") return addWeeks(d, interval);
  if (freq === "monthly") return addMonths(d, interval);
  return addDays(d, 1);
}

/**
 * Expand a recurring event into concrete {start,end} occurrences that overlap
 * [rangeStart, rangeEnd]. Capped to avoid runaway loops. Non-recurring callers
 * shouldn't use this. Editing/deleting any occurrence acts on the series (MVP —
 * no per-instance exceptions).
 */
export function expandOccurrences(
  baseStart: Date,
  baseEnd: Date,
  rule: string,
  rangeStart: Date,
  rangeEnd: Date,
): { start: Date; end: Date }[] {
  const map = new Map(
    rule.split(";").map((p) => {
      const [k, v] = p.split("=");
      return [k, v] as const;
    }),
  );
  const f = map.get("FREQ");
  const freq: RecurFreq =
    f === "DAILY" ? "daily" : f === "WEEKLY" ? "weekly" : f === "MONTHLY" ? "monthly" : "none";
  if (freq === "none") return [{ start: baseStart, end: baseEnd }];
  const interval = parseInt(map.get("INTERVAL") ?? "1", 10) || 1;
  const untilRaw = map.get("UNTIL");
  const until = untilRaw
    ? new Date(
        `${untilRaw.slice(0, 4)}-${untilRaw.slice(4, 6)}-${untilRaw.slice(6, 8)}T23:59:59Z`,
      )
    : null;

  const durationMs = baseEnd.getTime() - baseStart.getTime();
  const out: { start: Date; end: Date }[] = [];
  let cur = new Date(baseStart);
  let guard = 0;
  const hardStop =
    until && until < rangeEnd ? until : rangeEnd;
  while (guard++ < 1000) {
    if (cur > hardStop) break;
    const curEnd = new Date(cur.getTime() + durationMs);
    if (curEnd >= rangeStart && cur <= rangeEnd) {
      out.push({ start: new Date(cur), end: curEnd });
    }
    cur = step(cur, freq, interval);
  }
  return out;
}
