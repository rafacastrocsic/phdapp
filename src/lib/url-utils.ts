/**
 * Coerce a user-pasted profile string into a canonical URL.
 * Accepts:
 *   - full URL → returned as-is (https forced)
 *   - bare LinkedIn slug like "ada-lovelace" or "in/ada-lovelace"
 *   - linkedin.com paths without protocol
 */
export function normalizeLinkedIn(raw: string | null | undefined): string | null {
  const v = (raw ?? "").trim();
  if (!v) return null;
  if (/^https?:\/\//i.test(v)) {
    return v.replace(/^http:/i, "https:");
  }
  if (/^(www\.)?linkedin\.com\//i.test(v)) {
    return `https://${v.replace(/^www\./i, "")}`;
  }
  // Plain handle: assume /in/<handle>
  const slug = v.replace(/^\/+|\/+$/g, "").replace(/^in\//i, "");
  return `https://www.linkedin.com/in/${slug}`;
}

/** Coerce a free-form ORCID like "0000-0002-1825-0097" or full URL to the canonical orcid.org URL. */
export function normalizeOrcid(raw: string | null | undefined): string | null {
  const v = (raw ?? "").trim();
  if (!v) return null;
  // Strip URL prefix if present
  const m = v.match(/(\d{4}-\d{4}-\d{4}-\d{3}[0-9X])/i);
  if (m) return `https://orcid.org/${m[1].toUpperCase()}`;
  return null;
}

export function normalizeWebsite(raw: string | null | undefined): string | null {
  const v = (raw ?? "").trim();
  if (!v) return null;
  if (/^https?:\/\//i.test(v)) return v;
  return `https://${v.replace(/^\/+/, "")}`;
}
