/**
 * Multi-link list stored as JSON-in-String on Ticket and Event (mirrors the
 * existing `subtasks` / `agenda` pattern). Each entry has a short label and
 * a canonical https URL. Used for attaching papers, websites, repos, etc.
 * — anything beyond the single dedicated fields (Drive folder on tasks,
 * meeting URL on events).
 */
import { z } from "zod";

export interface ExternalLink {
  id: string;
  label: string;
  url: string;
}

export function parseLinks(raw: string | null | undefined): ExternalLink[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter(
        (l): l is ExternalLink =>
          l &&
          typeof l.id === "string" &&
          typeof l.label === "string" &&
          typeof l.url === "string",
      )
      .map((l) => ({
        id: l.id,
        label: l.label,
        url: l.url,
      }));
  } catch {
    return [];
  }
}

/** Auto-prefix `https://` when the user pasted a bare host, force https
 *  when they pasted http, and reject anything that isn't a parseable URL. */
function normaliseUrl(raw: string): string | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;
  let candidate = trimmed;
  if (!/^https?:\/\//i.test(candidate)) {
    candidate = `https://${candidate.replace(/^\/+/, "")}`;
  } else if (/^http:\/\//i.test(candidate)) {
    candidate = candidate.replace(/^http:/i, "https:");
  }
  try {
    // URL constructor validates; if it throws the entry is rejected.
    new URL(candidate);
    return candidate;
  } catch {
    return null;
  }
}

/** Used by API routes (POST/PATCH) — input shape from the client. */
export const LinkInput = z.object({
  id: z.string().min(1).optional(),
  label: z.string().trim().min(1).max(120),
  url: z.string().trim().min(1).max(2048),
});

export type LinkInputT = z.infer<typeof LinkInput>;

/**
 * Server-side validation + canonicalisation. Drops entries with an
 * unparseable URL, assigns missing ids, trims labels, and caps the list
 * to LIMIT entries. Returns the canonical array (caller serialises with
 * JSON.stringify when persisting).
 */
export function sanitiseLinks(
  raw: LinkInputT[] | undefined,
  opts: { limit?: number } = {},
): ExternalLink[] {
  const limit = opts.limit ?? 50;
  if (!Array.isArray(raw)) return [];
  const out: ExternalLink[] = [];
  for (const l of raw) {
    if (out.length >= limit) break;
    const url = normaliseUrl(l.url);
    if (!url) continue;
    const label = l.label.trim();
    if (!label) continue;
    out.push({
      id: l.id && l.id.trim() ? l.id : crypto.randomUUID(),
      label: label.slice(0, 120),
      url,
    });
  }
  return out;
}
