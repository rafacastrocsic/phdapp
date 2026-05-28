import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/** Display name used everywhere except the formal profile header. */
export function displayName(s: {
  fullName: string;
  alias?: string | null;
}): string {
  return s.alias?.trim() || s.fullName;
}

export function initials(name?: string | null): string {
  if (!name) return "?";
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((s) => s[0]!.toUpperCase())
    .join("");
}

const PALETTE = [
  "#06b6d4", // cyan
  "#8b5cf6", // violet
  "#ec4899", // pink
  "#f97316", // orange
  "#22c55e", // green
  "#eab308", // yellow
  "#3b82f6", // blue
  "#ef4444", // red
  "#14b8a6", // teal
  "#a855f7", // purple
];

export function colorFor(seed: string): string {
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) >>> 0;
  return PALETTE[h % PALETTE.length]!;
}

/**
 * Format a timestamp for chat-message-style display: always shows the
 * time of day plus a date hint that's as concise as possible.
 *
 *   today              → "Today · 14:30"
 *   yesterday          → "Yesterday · 14:30"
 *   within this year   → "May 26 · 14:30"
 *   prior years        → "May 26, 2024 · 14:30"
 *
 * Keeps every message anchored to a date without the noise of always
 * spelling out today's date.
 */
export function chatTimestamp(date: Date | string): string {
  const d = typeof date === "string" ? new Date(date) : date;
  const now = new Date();
  const hhmm = `${String(d.getHours()).padStart(2, "0")}:${String(
    d.getMinutes(),
  ).padStart(2, "0")}`;
  const sameDay = (a: Date, b: Date) =>
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate();
  if (sameDay(d, now)) return `Today · ${hhmm}`;
  const yesterday = new Date(now);
  yesterday.setDate(now.getDate() - 1);
  if (sameDay(d, yesterday)) return `Yesterday · ${hhmm}`;
  const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  const month = MONTHS[d.getMonth()];
  if (d.getFullYear() === now.getFullYear())
    return `${month} ${d.getDate()} · ${hhmm}`;
  return `${month} ${d.getDate()}, ${d.getFullYear()} · ${hhmm}`;
}

export function relativeTime(date: Date | string | null | undefined): string {
  if (!date) return "";
  const d = typeof date === "string" ? new Date(date) : date;
  const diffSec = Math.round((Date.now() - d.getTime()) / 1000);
  const abs = Math.abs(diffSec);
  const past = diffSec >= 0;
  const fmt = (n: number, unit: string) =>
    past ? `${n}${unit} ago` : `in ${n}${unit}`;
  if (abs < 60) return past ? "just now" : "soon";
  if (abs < 3600) return fmt(Math.round(abs / 60), "m");
  if (abs < 86400) return fmt(Math.round(abs / 3600), "h");
  if (abs < 86400 * 30) return fmt(Math.round(abs / 86400), "d");
  if (abs < 86400 * 365) return fmt(Math.round(abs / (86400 * 30)), "mo");
  return fmt(Math.round(abs / (86400 * 365)), "y");
}
