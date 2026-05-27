import React from "react";

/**
 * Auto-detect URLs in a plain-text string and turn them into clickable
 * anchors. Returns a mixed React-children array of strings and <a>
 * elements, suitable for dropping straight into JSX inside any
 * `whitespace-pre-wrap` container (newlines and runs of whitespace
 * inside the string segments are preserved).
 *
 * Rules:
 *  - Matches `http://...` and `https://...` (full schemes), plus
 *    schemeless `www....` (which we then prefix with `https://` in
 *    the rendered `href` so the link still works).
 *  - Stops at whitespace or a few obviously-not-part-of-the-url
 *    characters (`<`, `>`, `"`).
 *  - Trims trailing sentence punctuation (`.,;:!?'")]}`) off the
 *    URL — so `look at https://example.com.` doesn't include the
 *    final period in the link. The trimmer is paren/bracket aware:
 *    it keeps a trailing `)` if the URL also contains a `(` (so
 *    Wikipedia-style `…/Foo_(bar)` links survive).
 *  - Only `http(s)` / `www` are matched, so `javascript:` and
 *    `data:` payloads can never appear in the rendered href.
 */

// One greedy run of non-space, non-bracket-stop chars after a scheme.
// The trailing trimmer cleans up after-the-fact (see below).
const URL_REGEX = /(?:https?:\/\/|www\.)[^\s<>"]+/gi;

function trimTrailing(url: string): string {
  let s = url;
  while (s.length > 0) {
    const ch = s[s.length - 1];
    // Keep `)` and `]` if the URL has a matching opener (Wikipedia
    // and similar). For all other trailing punctuation, strip.
    if (ch === ")" && s.includes("(")) break;
    if (ch === "]" && s.includes("[")) break;
    if (/[.,;:!?'")\]}]/.test(ch)) {
      s = s.slice(0, -1);
      continue;
    }
    break;
  }
  return s;
}

export function linkify(text: string): React.ReactNode[] {
  if (!text) return [text];
  const out: React.ReactNode[] = [];
  let last = 0;
  let idx = 0;
  // Reset regex state because it carries `lastIndex` across calls
  // when declared with the /g flag.
  URL_REGEX.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = URL_REGEX.exec(text)) !== null) {
    const start = m.index;
    const raw = m[0];
    const url = trimTrailing(raw);
    if (!url) continue;
    const end = start + url.length;
    if (start > last) out.push(text.slice(last, start));
    const href = url.startsWith("www.") ? `https://${url}` : url;
    out.push(
      <a
        key={idx++}
        href={href}
        target="_blank"
        rel="noopener noreferrer"
        // Inherit text color so the link is readable on whatever
        // background the bubble has (violet for own chat messages,
        // white for others, slate for comments / feedback).
        className="underline underline-offset-2 hover:no-underline"
      >
        {url}
      </a>,
    );
    last = end;
    // If we shortened the URL via trimTrailing, rewind the regex
    // so the next iteration picks up where the real URL actually
    // ended (otherwise we'd skip a few characters of plain text).
    if (url.length < raw.length) {
      URL_REGEX.lastIndex = end;
    }
  }
  if (last < text.length) out.push(text.slice(last));
  return out;
}
