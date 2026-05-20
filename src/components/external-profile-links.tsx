import { Globe } from "lucide-react";

/* ---------- brand icons (inline SVG so we don't add a dep) ---------- */

export function LinkedinIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden className={className}>
      <path d="M20.45 20.45h-3.55v-5.57c0-1.33-.03-3.05-1.86-3.05-1.86 0-2.15 1.45-2.15 2.96v5.66H9.34V9h3.41v1.56h.05c.48-.9 1.65-1.86 3.4-1.86 3.63 0 4.3 2.39 4.3 5.5v6.25zM5.34 7.43a2.06 2.06 0 1 1 0-4.12 2.06 2.06 0 0 1 0 4.12zM7.12 20.45H3.56V9h3.56v11.45zM22.22 0H1.77C.79 0 0 .77 0 1.73v20.54C0 23.23.79 24 1.77 24h20.45c.99 0 1.78-.77 1.78-1.73V1.73C24 .77 23.21 0 22.22 0z" />
    </svg>
  );
}

export function OrcidIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 256 256" aria-hidden className={className}>
      <circle cx="128" cy="128" r="128" fill="#A6CE39" />
      <g fill="#fff">
        <path d="M86.3 186.2H70.9V79.1h15.4v107.1z" />
        <path d="M108.9 79.1h41.6c39.6 0 57 28.3 57 53.6 0 27.5-21.5 53.6-56.8 53.6h-41.8V79.1zm15.4 93.3h24.5c34.9 0 42.9-26.5 42.9-39.7 0-21.5-13.7-39.7-43.7-39.7h-23.7v79.4z" />
        <circle cx="78.6" cy="56.8" r="9.9" />
      </g>
    </svg>
  );
}

/** Google Scholar — stylised mortarboard "G" badge (rendered in Scholar blue). */
export function ScholarIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden className={className} fill="currentColor">
      <path d="M12 1L0 8l4 2.18v6L12 21l8-4.82v-6l2-1.09V17h2V8L12 1zm6.82 15.46L12 19.95l-6.82-3.49v-4.45L12 15l6.82-3v4.46z" />
    </svg>
  );
}

/* ---------- normalisers (for rendering) ---------- */

/** Resolve an ORCID free-form value to a full URL for href use. */
function orcidHref(raw: string): string {
  return raw.startsWith("http") ? raw : `https://orcid.org/${raw}`;
}

/* ---------- the row component ---------- */

interface Links {
  linkedinUrl?: string | null;
  orcidId?: string | null;
  scholarUrl?: string | null;
  websiteUrl?: string | null;
}

/**
 * Compact horizontal row of icon+label links: LinkedIn · ORCID · Scholar · Website.
 * Renders nothing if no links are set. `size` controls the icon size (3.5 = w-3.5 h-3.5).
 */
export function ExternalProfileLinks({
  links,
  size = 3.5,
  showLabels = true,
  className = "",
}: {
  links: Links;
  size?: 3 | 3.5 | 4;
  showLabels?: boolean;
  className?: string;
}) {
  const has =
    links.linkedinUrl || links.orcidId || links.scholarUrl || links.websiteUrl;
  if (!has) return null;
  const iconCls = size === 4 ? "h-4 w-4" : size === 3 ? "h-3 w-3" : "h-3.5 w-3.5";
  return (
    <div
      className={`flex flex-wrap items-center gap-x-3 gap-y-1 text-xs ${className}`}
    >
      {links.linkedinUrl && (
        <a
          href={links.linkedinUrl}
          target="_blank"
          rel="noopener"
          className="flex items-center gap-1 text-sky-700 hover:text-sky-900"
          title={links.linkedinUrl}
        >
          <LinkedinIcon className={iconCls} />
          {showLabels && "LinkedIn"}
        </a>
      )}
      {links.orcidId && (
        <a
          href={orcidHref(links.orcidId)}
          target="_blank"
          rel="noopener"
          className="flex items-center gap-1 hover:underline"
          style={{ color: "#A6CE39" }}
          title={`ORCID: ${links.orcidId}`}
        >
          <OrcidIcon className={iconCls} />
          {showLabels && <span className="text-slate-600">ORCID</span>}
        </a>
      )}
      {links.scholarUrl && (
        <a
          href={links.scholarUrl}
          target="_blank"
          rel="noopener"
          className="flex items-center gap-1 hover:underline"
          style={{ color: "#4285F4" }}
          title={`Google Scholar: ${links.scholarUrl}`}
        >
          <ScholarIcon className={iconCls} />
          {showLabels && <span className="text-slate-600">Scholar</span>}
        </a>
      )}
      {links.websiteUrl && (
        <a
          href={links.websiteUrl}
          target="_blank"
          rel="noopener"
          className="flex items-center gap-1 text-violet-700 hover:text-violet-900"
          title={links.websiteUrl}
        >
          <Globe className={iconCls} />
          {showLabels && "Website"}
        </a>
      )}
    </div>
  );
}
