import { FolderOpen, CalendarDays } from "lucide-react";

function calendarUrl(calendarId: string) {
  return `https://calendar.google.com/calendar/u/0/r?cid=${Buffer.from(
    calendarId,
  ).toString("base64")}`;
}

/**
 * Read-only links to a Project Researcher's own workspace (folder + calendar),
 * shown on their Team card so the seniors they work with can open them. The
 * researcher creates and manages these themselves from Settings → My
 * workspace; there are no controls here. Renders nothing until they exist.
 */
export function ResearcherWorkspace({
  driveFolderId,
  calendarId,
}: {
  driveFolderId: string | null;
  calendarId: string | null;
}) {
  if (!driveFolderId && !calendarId) return null;
  const linkCls =
    "inline-flex items-center gap-1 text-[11px] font-medium text-[var(--c-blue)] hover:underline";
  return (
    <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1">
      {driveFolderId && (
        <a
          href={`https://drive.google.com/drive/folders/${driveFolderId}`}
          target="_blank"
          rel="noopener noreferrer"
          className={linkCls}
        >
          <FolderOpen className="h-3 w-3" /> Workspace folder
        </a>
      )}
      {calendarId && (
        <a
          href={calendarUrl(calendarId)}
          target="_blank"
          rel="noopener noreferrer"
          className={linkCls}
        >
          <CalendarDays className="h-3 w-3" /> Workspace calendar
        </a>
      )}
    </div>
  );
}
