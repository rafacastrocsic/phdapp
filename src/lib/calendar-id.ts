/**
 * Accepts whatever the user pasted (a real calendar ID, a `…?cid=<base64>` URL,
 * or an embed URL with `?src=…`) and returns the bare calendar ID.
 * Returns null for an empty/invalid input.
 */
export function normalizeCalendarId(input: string | null | undefined): string | null {
  const raw = (input ?? "").trim();
  if (!raw) return null;

  // Direct ID: contains @ but not a URL
  if (!raw.startsWith("http") && raw.includes("@")) return raw;

  // URL forms
  try {
    const url = new URL(raw);

    // ?src=<email> (embed URL)
    const src = url.searchParams.get("src");
    if (src && src.includes("@")) return decodeURIComponent(src);

    // ?cid=<base64> (subscribe URL)
    const cid = url.searchParams.get("cid");
    if (cid) {
      const padded = cid + "==".slice(0, (4 - (cid.length % 4)) % 4);
      try {
        const decoded = Buffer.from(padded, "base64").toString("utf8");
        if (decoded.includes("@") || decoded === "primary") return decoded;
      } catch {
        // fall through
      }
    }
  } catch {
    // not a URL
  }

  // Fallback: keep the raw value (lets users use "primary", etc.)
  return raw;
}
