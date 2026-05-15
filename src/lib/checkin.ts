/** Monday 00:00 UTC of the ISO week containing `d` (default: now). */
export function currentWeekStart(d: Date = new Date()): Date {
  const x = new Date(
    Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()),
  );
  const dow = (x.getUTCDay() + 6) % 7; // 0 = Monday
  x.setUTCDate(x.getUTCDate() - dow);
  return x;
}
