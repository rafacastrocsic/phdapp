import Holidays from "date-holidays";

/**
 * Public-holiday data for Sevilla, Spain.
 *
 * Uses the `date-holidays` package so movable feasts (Easter Thursday
 * & Friday, Corpus Christi) are computed correctly year by year. The
 * region tuple `('ES', 'AN', 'SE')` maps to Spain → Andalusia →
 * Sevilla, which gives the full national + regional + local set
 * including:
 *
 *   - Año Nuevo, Reyes (national)
 *   - Día de Andalucía (regional)
 *   - Jueves Santo, Viernes Santo (movable national-or-regional)
 *   - Día del Trabajador, Asunción, Fiesta Nacional, Todos los
 *     Santos, Constitución, Inmaculada, Navidad (national)
 *   - Plus replacement dates for those that fall on a weekend
 *
 * Only `type === "public"` entries are returned — "observance"
 * entries (e.g. Día de la Madre, Pentecostés) aren't days off.
 *
 * If we ever want to support multiple cities or per-user
 * preferences, the hard-coded region tuple becomes a parameter.
 */
const REGION = { country: "ES", state: "AN", region: "SE" } as const;

export interface Holiday {
  date: Date;
  name: string;
  /** e.g. "public" — only public entries are surfaced. */
  type: string;
}

// Cache one `Holidays` instance per locale. Constructing it costs a
// small amount of work (loads YAML data); for a long-running Node
// process there's no reason to repeat it per request.
let _hd: Holidays | null = null;
function getEngine(): Holidays {
  if (!_hd) _hd = new Holidays(REGION.country, REGION.state, REGION.region);
  return _hd;
}

// ─── Sevilla city local holidays (not in date-holidays) ───
// The Ayuntamiento de Sevilla publishes 2 local holidays per year in
// the Boletín Oficial de la Provincia (BOP). Corpus Christi is
// always one of them; the second varies and has to be added here
// once the BOP for that year is published.

/**
 * Easter Sunday for a given Gregorian year (Anonymous Gregorian
 * algorithm — sometimes called the "Gauss" algorithm). Returns a UTC
 * midnight Date so downstream arithmetic doesn't drift across DST.
 */
function easterSunday(year: number): Date {
  const a = year % 19;
  const b = Math.floor(year / 100);
  const c = year % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const L = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * L) / 451);
  const month = Math.floor((h + L - 7 * m + 114) / 31);
  const day = ((h + L - 7 * m + 114) % 31) + 1;
  return new Date(Date.UTC(year, month - 1, day));
}

/** Corpus Christi = Thursday 60 days after Easter Sunday. */
function corpusChristi(year: number): Date {
  return new Date(easterSunday(year).getTime() + 60 * 86_400_000);
}

/**
 * Per-year overrides for the SECOND Sevilla local holiday (the one
 * that's not Corpus Christi). The Ayuntamiento publishes this in
 * the BOP each autumn for the following year. Add a new entry as
 * each year's calendar is announced.
 *
 * Keys are calendar years; values are arrays so a year with no
 * second local (rare) can stay empty.
 *
 *   Example: 2024 — Feria's Wednesday was the second local.
 *
 * If left empty for a given year, Corpus Christi alone is shown
 * (still better than missing it entirely).
 */
const SEVILLA_EXTRAS_BY_YEAR: Record<number, Holiday[]> = {
  // 2026: second local TBD — add once published in the BOP.
};

function sevillaLocalHolidays(year: number): Holiday[] {
  return [
    {
      date: corpusChristi(year),
      name: "Corpus Christi",
      type: "public",
    },
    ...(SEVILLA_EXTRAS_BY_YEAR[year] ?? []),
  ];
}

/**
 * Every public holiday for a given calendar year, sorted by date.
 * Merges date-holidays output with Sevilla city locals (Corpus
 * Christi + any year-specific extras).
 */
export function getHolidaysForYear(year: number): Holiday[] {
  const fromLib = getEngine()
    .getHolidays(year)
    .filter((h) => h.type === "public")
    .map((h) => ({ date: new Date(h.date), name: h.name, type: h.type }));
  return [...fromLib, ...sevillaLocalHolidays(year)].sort(
    (a, b) => a.date.getTime() - b.date.getTime(),
  );
}

/**
 * All public holidays falling in [from, to). Walks the year range
 * needed to cover the window (usually 1 or 2 calendar years).
 */
export function getHolidaysInRange(from: Date, to: Date): Holiday[] {
  const startY = from.getFullYear();
  const endY = to.getFullYear();
  const out: Holiday[] = [];
  for (let y = startY; y <= endY; y++) {
    for (const h of getHolidaysForYear(y)) {
      if (h.date >= from && h.date < to) out.push(h);
    }
  }
  return out;
}
