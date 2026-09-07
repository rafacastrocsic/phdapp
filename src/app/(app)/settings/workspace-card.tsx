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
  Plus,
  X,
} from "lucide-react";

type Props = {
  driveFolderId: string | null;
  calendarId: string | null;
  hasDrive: boolean;
  hasCal: boolean;
};

function calendarUrl(calendarId: string) {
  try {
    return `https://calendar.google.com/calendar/u/0/r?cid=${btoa(calendarId)}`;
  } catch {
    return "https://calendar.google.com/calendar/r";
  }
}

// Self-service: the researcher creates their own Drive folder + calendar in
// THEIR OWN Google account, shared view-only with the students they work with
// and those students' supervisors + team advisors.
export function WorkspaceCard(props: Props) {
  const router = useRouter();
  const [folder, setFolder] = useState(props.driveFolderId);
  const [cal, setCal] = useState(props.calendarId);
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState<{ type: "ok" | "err"; text: string } | null>(null);

  async function act(action: string) {
    setBusy(action);
    setMsg(null);
    try {
      const r = await fetch("/api/me/workspace", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action }),
      });
      const data = await r.json();
      if (!r.ok) throw new Error(data.error || data.warning || "Something went wrong");
      if (action === "clear_drive") setFolder(null);
      else if (action === "clear_calendar") setCal(null);
      else {
        if (data.driveFolderId) setFolder(data.driveFolderId);
        if (data.calendarId) setCal(data.calendarId);
      }
      if (action.startsWith("sync"))
        setMsg({
          type: "ok",
          text: `Sharing refreshed${typeof data.shared === "number" ? ` (${data.shared} people)` : ""}.`,
        });
      router.refresh();
    } catch (e) {
      setMsg({ type: "err", text: (e as Error).message });
    } finally {
      setBusy(null);
    }
  }

  const needsGoogle = !props.hasDrive || !props.hasCal;
  const linkCls =
    "inline-flex items-center gap-1.5 rounded-lg border bg-white px-3 py-2 text-sm font-medium text-slate-700 shadow-sm hover:bg-slate-50";

  return (
    <div className="space-y-4">
      <p className="text-sm text-slate-500">
        Your own Drive folder and calendar, created in <strong>your</strong>{" "}
        Google account. They&apos;re shared <strong>view-only</strong> with the
        students you work with and each of their supervisors and team advisors —
        so you and the student can see each other&apos;s folder and calendar
        without editing them.
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
        {folder ? (
          <div className="flex flex-wrap items-center gap-2">
            <a
              href={`https://drive.google.com/drive/folders/${folder}`}
              target="_blank"
              rel="noopener noreferrer"
              className={linkCls}
            >
              <ExternalLink className="h-4 w-4 text-slate-400" /> Open folder
            </a>
            <Button
              variant="outline"
              type="button"
              disabled={busy !== null}
              onClick={() => act("sync_drive")}
              title="Re-share with your students and their teams (e.g. after being assigned a new student)"
            >
              {busy === "sync_drive" ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <RefreshCw className="h-4 w-4" />
              )}
              Sync sharing
            </Button>
            <button
              type="button"
              disabled={busy !== null}
              onClick={() => {
                if (
                  window.confirm(
                    "Forget this folder link? The Google folder itself stays in your Drive; you can then create/link a new one.",
                  )
                )
                  void act("clear_drive");
              }}
              className="inline-flex items-center gap-1 text-xs font-medium text-slate-400 hover:text-[var(--c-red)] disabled:opacity-50"
            >
              <X className="h-3.5 w-3.5" /> Remove
            </button>
          </div>
        ) : (
          <Button
            variant="brand"
            type="button"
            disabled={needsGoogle || busy !== null}
            onClick={() => act("create_drive")}
          >
            {busy === "create_drive" ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Plus className="h-4 w-4" />
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
        {cal ? (
          <div className="flex flex-wrap items-center gap-2">
            <a href={calendarUrl(cal)} target="_blank" rel="noopener noreferrer" className={linkCls}>
              <ExternalLink className="h-4 w-4 text-slate-400" /> Open in Google
              Calendar
            </a>
            <Button
              variant="outline"
              type="button"
              disabled={busy !== null}
              onClick={() => act("sync_calendar")}
            >
              {busy === "sync_calendar" ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <RefreshCw className="h-4 w-4" />
              )}
              Sync sharing
            </Button>
            <button
              type="button"
              disabled={busy !== null}
              onClick={() => {
                if (window.confirm("Forget this calendar link?"))
                  void act("clear_calendar");
              }}
              className="inline-flex items-center gap-1 text-xs font-medium text-slate-400 hover:text-[var(--c-red)] disabled:opacity-50"
            >
              <X className="h-3.5 w-3.5" /> Remove
            </button>
          </div>
        ) : (
          <Button
            variant="brand"
            type="button"
            disabled={needsGoogle || busy !== null}
            onClick={() => act("create_calendar")}
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
