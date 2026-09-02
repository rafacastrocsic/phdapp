"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import {
  FolderOpen,
  CalendarDays,
  RefreshCw,
  ExternalLink,
  Loader2,
  AlertTriangle,
} from "lucide-react";

type Props = {
  driveFolderId: string | null;
  calendarId: string | null;
  shareStudents: boolean;
  hasDrive: boolean;
  hasCal: boolean;
};

function calendarUrl(calendarId: string) {
  // Standard "open this calendar" link (cid = base64 of the calendar id).
  try {
    return `https://calendar.google.com/calendar/u/0/r?cid=${btoa(calendarId)}`;
  } catch {
    return "https://calendar.google.com/calendar/r";
  }
}

export function WorkspaceCard(props: Props) {
  const router = useRouter();
  const [folderId, setFolderId] = useState(props.driveFolderId);
  const [calId, setCalId] = useState(props.calendarId);
  const [share, setShare] = useState(props.shareStudents);
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState<{ type: "ok" | "err"; text: string } | null>(null);

  async function post(action: string) {
    setBusy(action);
    setMsg(null);
    try {
      const r = await fetch("/api/me/workspace", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action }),
      });
      const data = await r.json();
      if (!r.ok) throw new Error(data.error || "Something went wrong");
      if (data.driveFolderId) setFolderId(data.driveFolderId);
      if (data.calendarId) setCalId(data.calendarId);
      setMsg({
        type: "ok",
        text:
          action === "sync_drive"
            ? `Sharing refreshed${typeof data.shared === "number" ? ` (${data.shared} people)` : ""}.`
            : "Done.",
      });
      router.refresh();
    } catch (e) {
      setMsg({ type: "err", text: (e as Error).message });
    } finally {
      setBusy(null);
    }
  }

  async function toggleShare(next: boolean) {
    setShare(next);
    setBusy("share");
    setMsg(null);
    try {
      const r = await fetch("/api/me/workspace", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ shareStudents: next }),
      });
      if (!r.ok) throw new Error((await r.json()).error || "Failed");
      setMsg({
        type: "ok",
        text: next
          ? "Your folder is now shared with your assigned students (view-only)."
          : "New students won't be added; existing shares are unchanged.",
      });
    } catch (e) {
      setShare(!next); // revert
      setMsg({ type: "err", text: (e as Error).message });
    } finally {
      setBusy(null);
    }
  }

  const needsGoogle = !props.hasDrive || !props.hasCal;

  return (
    <div className="space-y-4">
      <p className="text-sm text-slate-500">
        Your own Drive folder and calendar, in your Google account. The folder
        is shared <strong>view-only</strong> with the supervising team; the
        calendar is yours to use in Google Calendar.
      </p>

      {needsGoogle && (
        <div className="flex items-start gap-2 rounded-lg bg-amber-50 p-3 text-sm text-amber-800">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          <span>
            Link your Google account first (Drive + Calendar). Sign out and sign
            in again, re-approving the consent screen, then come back here.
          </span>
        </div>
      )}

      {/* Drive folder */}
      <div className="rounded-xl border p-4">
        <div className="mb-2 flex items-center gap-2 text-sm font-semibold text-slate-800">
          <FolderOpen className="h-4 w-4 text-[var(--c-blue)]" /> My Drive folder
        </div>
        {folderId ? (
          <div className="space-y-3">
            <div className="flex flex-wrap items-center gap-2">
              <a
                href={`https://drive.google.com/drive/folders/${folderId}`}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 rounded-lg border bg-white px-3 py-2 text-sm font-medium text-slate-700 shadow-sm hover:bg-slate-50"
              >
                <ExternalLink className="h-4 w-4 text-slate-400" /> Open folder
              </a>
              <Button
                variant="outline"
                type="button"
                disabled={busy !== null}
                onClick={() => post("sync_drive")}
              >
                {busy === "sync_drive" ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <RefreshCw className="h-4 w-4" />
                )}
                Sync sharing
              </Button>
            </div>
            <label className="flex items-center gap-2 text-sm text-slate-700">
              <input
                type="checkbox"
                checked={share}
                disabled={busy !== null}
                onChange={(e) => toggleShare(e.target.checked)}
                className="h-4 w-4 rounded border-slate-300"
              />
              Also share this folder (view-only) with my assigned students
            </label>
          </div>
        ) : (
          <Button
            variant="brand"
            type="button"
            disabled={needsGoogle || busy !== null}
            onClick={() => post("create_drive")}
          >
            {busy === "create_drive" ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <FolderOpen className="h-4 w-4" />
            )}
            Create my Drive folder
          </Button>
        )}
      </div>

      {/* Calendar */}
      <div className="rounded-xl border p-4">
        <div className="mb-2 flex items-center gap-2 text-sm font-semibold text-slate-800">
          <CalendarDays className="h-4 w-4 text-[var(--c-teal)]" /> My calendar
        </div>
        {calId ? (
          <a
            href={calendarUrl(calId)}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 rounded-lg border bg-white px-3 py-2 text-sm font-medium text-slate-700 shadow-sm hover:bg-slate-50"
          >
            <ExternalLink className="h-4 w-4 text-slate-400" /> Open in Google
            Calendar
          </a>
        ) : (
          <Button
            variant="brand"
            type="button"
            disabled={needsGoogle || busy !== null}
            onClick={() => post("create_calendar")}
          >
            {busy === "create_calendar" ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <CalendarDays className="h-4 w-4" />
            )}
            Create my calendar
          </Button>
        )}
      </div>

      {msg && (
        <p
          className={
            msg.type === "ok"
              ? "text-sm text-[var(--c-green)]"
              : "text-sm text-[var(--c-red)]"
          }
        >
          {msg.text}
        </p>
      )}
    </div>
  );
}
