"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { FolderOpen, CalendarDays, RefreshCw, Loader2, Plus, X } from "lucide-react";

function calendarUrl(calendarId: string) {
  try {
    return `https://calendar.google.com/calendar/u/0/r?cid=${btoa(calendarId)}`;
  } catch {
    return "https://calendar.google.com/calendar/r";
  }
}

/**
 * Compact workspace controls on a Project Researcher's Team card. Everyone
 * sees the folder/calendar links (Google enforces who can actually open
 * them); admins/supervisors additionally get the create/sync buttons, since
 * the resource is created in the acting user's own Google account.
 */
export function ResearcherWorkspace({
  userId,
  driveFolderId,
  calendarId,
  canProvision,
}: {
  userId: string;
  driveFolderId: string | null;
  calendarId: string | null;
  canProvision: boolean;
}) {
  const router = useRouter();
  const [folder, setFolder] = useState(driveFolderId);
  const [cal, setCal] = useState(calendarId);
  const [busy, setBusy] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  async function act(action: string) {
    setBusy(action);
    setErr(null);
    try {
      const r = await fetch(`/api/users/${userId}/workspace`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action }),
      });
      const data = await r.json();
      if (!r.ok) throw new Error(data.error || data.warning || "Failed");
      if (action === "clear_drive") setFolder(null);
      else if (action === "clear_calendar") setCal(null);
      else {
        if (data.driveFolderId) setFolder(data.driveFolderId);
        if (data.calendarId) setCal(data.calendarId);
      }
      router.refresh();
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(null);
    }
  }

  const linkCls =
    "inline-flex items-center gap-1 text-[11px] font-medium text-[var(--c-blue)] hover:underline";
  const btnCls =
    "inline-flex items-center gap-1 rounded-md border bg-white px-2 py-1 text-[11px] font-medium text-slate-600 hover:bg-slate-50 disabled:opacity-50";

  return (
    <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1">
      {folder ? (
        <span className="inline-flex items-center gap-1">
          <a
            href={`https://drive.google.com/drive/folders/${folder}`}
            target="_blank"
            rel="noopener noreferrer"
            className={linkCls}
          >
            <FolderOpen className="h-3 w-3" /> Workspace folder
          </a>
          {canProvision && (
            <button
              type="button"
              disabled={busy !== null}
              title="Remove this folder link (a fresh one can then be created; the Google folder itself is left untouched)"
              onClick={() => {
                if (
                  window.confirm(
                    "Remove the workspace folder link? The Google folder itself stays in your Drive — delete it there if you want. A new folder can then be created.",
                  )
                )
                  void act("clear_drive");
              }}
              className="text-slate-400 hover:text-[var(--c-red)] disabled:opacity-50"
            >
              <X className="h-3 w-3" />
            </button>
          )}
        </span>
      ) : (
        canProvision && (
          <button
            type="button"
            className={btnCls}
            disabled={busy !== null}
            onClick={() => act("create_drive")}
          >
            {busy === "create_drive" ? (
              <Loader2 className="h-3 w-3 animate-spin" />
            ) : (
              <Plus className="h-3 w-3" />
            )}
            Create folder
          </button>
        )
      )}

      {cal ? (
        <span className="inline-flex items-center gap-1">
          <a href={calendarUrl(cal)} target="_blank" rel="noopener noreferrer" className={linkCls}>
            <CalendarDays className="h-3 w-3" /> Workspace calendar
          </a>
          {canProvision && (
            <button
              type="button"
              disabled={busy !== null}
              title="Remove this calendar link (the Google calendar itself is left untouched)"
              onClick={() => {
                if (window.confirm("Remove the workspace calendar link?"))
                  void act("clear_calendar");
              }}
              className="text-slate-400 hover:text-[var(--c-red)] disabled:opacity-50"
            >
              <X className="h-3 w-3" />
            </button>
          )}
        </span>
      ) : (
        canProvision && (
          <button
            type="button"
            className={btnCls}
            disabled={busy !== null}
            onClick={() => act("create_calendar")}
          >
            {busy === "create_calendar" ? (
              <Loader2 className="h-3 w-3 animate-spin" />
            ) : (
              <Plus className="h-3 w-3" />
            )}
            Create calendar
          </button>
        )
      )}

      {canProvision && (folder || cal) && (
        <button
          type="button"
          className={btnCls}
          disabled={busy !== null}
          title="Re-apply sharing to the students you're assigned to and their teams"
          onClick={async () => {
            if (folder) await act("sync_drive");
            if (cal) await act("sync_calendar");
          }}
        >
          {busy === "sync_drive" || busy === "sync_calendar" ? (
            <Loader2 className="h-3 w-3 animate-spin" />
          ) : (
            <RefreshCw className="h-3 w-3" />
          )}
          Sync sharing
        </button>
      )}

      {err && <span className="text-[11px] text-[var(--c-red)]">{err}</span>}
    </div>
  );
}
