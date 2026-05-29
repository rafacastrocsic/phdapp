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

/**
 * Every public holiday for a given calendar year, sorted by date.
 */
export function getHolidaysForYear(year: number): Holiday[] {
  const all = getEngine().getHolidays(year);
  return all
    .filter((h) => h.type === "public")
    .map((h) => ({ date: new Date(h.date), name: h.name, type: h.type }))
    .sort((a, b) => a.date.getTime() - b.date.getTime());
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
