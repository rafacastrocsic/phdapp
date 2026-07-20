import React from "react";

/**
 * Auto-detect URLs in a plain-text string and turn them into clickable
 * anchors. Returns a mixed React-children array of strings and <a>
 * elements, suitable for dropping straight into JSX inside any
 * `whitespace-pre-wrap` container (newlines and runs of whitespace
 * inside the string segments are preserved).
 *
 * Matches three shapes:
 *  - Full schemes: `http://…` / `https://…`.
 *  - Schemeless `www.…`.
 *  - Bare domains with a recognised TLD, with or without a path —
 *    e.g. `doi.org/10.1000/xyz`, `github.com/org/repo`, `example.com`.
 *    A TLD whitelist keeps prose like `Node.js`, `Fig.2`, `e.g.`,
 *    `index.html`, `v1.2` from being mistaken for links, and a
 *    look-behind avoids linking the domain part of an email address.
 * Schemeless matches get an `https://` prefix in the rendered href.
 * Only `http(s)` hrefs are ever produced, so `javascript:` / `data:`
 * payloads can never appear.
 */

// Common gTLDs + ccTLDs. Deliberately excludes things that show up in
// prose after a dot (js, ts, py, html, pdf, 2, 0, …).
const TLD =
  "com|org|net|edu|gov|mil|int|io|co|ai|app|dev|me|info|biz|tv|online|site|" +
  "xyz|blog|wiki|cloud|tech|academy|uk|us|ca|au|nl|se|ch|it|es|de|fr|eu|pt|" +
  "be|dk|no|fi|pl|cz|at|ie|jp|cn|in|br|ru|za|nz|kr|mx|ar|cl|gr|tr|il|sg|hk";

const SCHEMED = String.raw`(?:https?:\/\/|www\.)[^\s<>"]+`;
const BARE =
  String.raw`(?:[a-z0-9](?:[a-z0-9-]*[a-z0-9])?\.)+(?:` +
  TLD +
  String.raw`)\b(?:[\/?#][^\s<>"]*)?`;
// Look-behind blocks a match that's glued to an @ (email) or a word
// char / dot (so we don't grab a fragment of a longer token). A few old
// engines (pre-16.4 Safari) don't support look-behind and throw when the
// pattern is compiled — fall back to a look-behind-free version there so
// linkify never crashes a render (at worst an email's domain gets linked).
function buildUrlRegex(): RegExp {
  try {
    return new RegExp(
      String.raw`(?<![@\w.])(?:` + SCHEMED + "|" + BARE + ")",
      "gi",
    );
  } catch {
    return new RegExp("(?:" + SCHEMED + "|" + BARE + ")", "gi");
  }
}
const URL_REGEX = buildUrlRegex();

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
    const href = /^https?:\/\//i.test(url) ? url : `https://${url}`;
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
