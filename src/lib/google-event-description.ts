/**
 * Google Calendar has no fields for a meeting link, external links or a
 * documents folder — it has a single free-text Description (labelled "Notes"
 * in parts of Google's UI). Fold PhDapp's URLs into it so they're reachable
 * from the Google client on a phone, which is where people actually click
 * "join" from.
 *
 * The result is REBUILT from scratch every time rather than appended, so
 * repeated edits can never duplicate the block.
 */
export function composeGoogleDescription(opts: {
  description?: string | null;
  meetingUrl?: string | null;
  links?: { label?: string | null; url?: string | null }[] | null;
  driveFolderUrl?: string | null;
}): string | undefined {
  const lines: string[] = [];

  const meet = opts.meetingUrl?.trim();
  if (meet) lines.push(`Meeting link: ${meet}`);

  for (const l of opts.links ?? []) {
    const url = l?.url?.trim();
    if (url) lines.push(`${l?.label?.trim() || "Link"}: ${url}`);
  }

  const drive = opts.driveFolderUrl?.trim();
  if (drive) lines.push(`Documents: ${drive}`);

  const base = opts.description?.trim() ?? "";
  const parts: string[] = [];
  if (base) parts.push(base);
  if (lines.length > 0) parts.push(["— PhDapp —", ...lines].join("\n"));
  return parts.length > 0 ? parts.join("\n\n") : undefined;
}

