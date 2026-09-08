"use client";
import { useState } from "react";
import { Trash2, Wand2, CalendarSync } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export function MaintenanceTools() {
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ type: "ok" | "err"; text: string } | null>(null);

  async function runBackfillChannels() {
    if (
      !confirm(
        "Create a general team channel for every student that doesn't have one yet?\n\nStudents that already have a channel are left untouched.",
      )
    )
      return;
    setBusy(true);
    setMsg(null);
    const r = await fetch("/api/admin/backfill-team-channels", {
      method: "POST",
    });
    setBusy(false);
    if (!r.ok) {
      const j = await r.json().catch(() => ({}));
      setMsg({ type: "err", text: j.error ?? "Backfill failed" });
      return;
    }
    const j = await r.json();
    setMsg({
      type: "ok",
      text: `Backfill done — scanned ${j.scanned} student${j.scanned === 1 ? "" : "s"}, created ${j.created} new team channel${j.created === 1 ? "" : "s"}.`,
    });
  }

  async function runCalendarCleanup(dryRun: boolean) {
    if (
      !dryRun &&
      !confirm(
        "Clean up calendar duplicates and re-push orphaned task events?\n\n" +
          "This will:\n" +
          " • Delete leftover [Task]_ / [Sub-task]_ events that are no longer\n" +
          "   linked to a real task in PhDapp (and remove their copy from\n" +
          "   Google Calendar where possible).\n" +
          " • Re-push to Google any task whose due-event failed to sync\n" +
          "   originally (e.g. during the recent invalid_grant period).\n\n" +
          "Sub-task events stay in PhDapp only (by design). Run the\n" +
          "dry-run first if you want to preview.",
      )
    )
      return;
    setBusy(true);
    setMsg(null);
    const r = await fetch(
      `/api/admin/calendar-cleanup${dryRun ? "?dryRun=1" : ""}`,
      { method: "POST" },
    );
    setBusy(false);
    if (!r.ok) {
      const j = await r.json().catch(() => ({}));
      setMsg({ type: "err", text: j.error ?? "Cleanup failed" });
      return;
    }
    const j = await r.json();
    const dup = (j.duplicates ?? []).length;
    const dangling = (j.danglingPrefixed ?? []).length;
    const ghosts = (j.googleGhosts ?? []).length;
    const ophs = (j.orphans ?? []).length;
    setMsg({
      type: "ok",
      text: dryRun
        ? `Dry-run: ${dup} duplicate + ${dangling} dangling PhDapp row(s), ${ghosts} Google ghost(s), ${ophs} task(s) to re-sync. Re-run without dry-run to apply.`
        : `Cleanup done — removed ${dup + dangling} PhDapp row(s), deleted ${ghosts} Google ghost(s), re-synced ${ophs} task(s). Refresh the Calendar to see the result.`,
    });
  }

  async function runOrphanEvents(action: "report" | "rehome" | "delete") {
    if (
      action === "delete" &&
      !confirm(
        "Delete the home-less calendar events (studentId=null, not General)?\n\n" +
          "These appear only under “All” and belong to no student, General or " +
          "researcher calendar — e.g. events the old “Sync Google” imported from a " +
          "personal calendar, or legacy team-only events.\n\n" +
          "Task/sub-task deadlines are NOT deleted (use “Re-home task deadlines” " +
          "for those). Only PhDapp rows are removed — Google Calendar is never " +
          "touched. Run “Diagnose” first to preview.",
      )
    )
      return;
    if (
      action === "rehome" &&
      !confirm(
        "Re-home General/team task & sub-task deadlines so they show under " +
          "“General only” instead of only under “All”?",
      )
    )
      return;
    setBusy(true);
    setMsg(null);
    const qs = action === "report" ? "" : `?fix=${action}`;
    const r = await fetch(`/api/admin/orphan-events${qs}`, { method: "POST" });
    setBusy(false);
    if (!r.ok) {
      const j = await r.json().catch(() => ({}));
      setMsg({ type: "err", text: j.error ?? "Failed" });
      return;
    }
    const j = await r.json();
    if (action === "delete") {
      setMsg({
        type: "ok",
        text: `Deleted ${j.deleted} home-less event(s) from PhDapp (Google untouched). Refresh the Calendar.`,
      });
      return;
    }
    if (action === "rehome") {
      setMsg({
        type: "ok",
        text: `Re-homed ${j.rehomed} task/sub-task deadline(s) to General.`,
      });
      return;
    }
    // report
    const owners = (j.owners ?? []).join(", ");
    const lines = (j.items ?? [])
      .slice(0, 20)
      .map(
        (i: {
          title: string;
          day: string;
          owner: string;
          recurring: boolean;
          allDay: boolean;
          fromGoogle: boolean;
          type: string;
        }) =>
          `• ${i.day} — “${i.title}” (${i.owner}) [${i.type}${
            i.recurring ? ", recurring" : ""
          }${i.allDay ? ", all-day" : ""}${i.fromGoogle ? ", from Google" : ""}]`,
      )
      .join("\n");
    setMsg({
      type: "ok",
      text:
        `${j.total} home-less event(s): ${j.deletableEvents} deletable, ` +
        `${j.rehomeableTaskDeadlines} task deadline(s) to re-home` +
        (owners ? `. Owners: ${owners}` : "") +
        (lines ? `\n\n${lines}` : ""),
    });
  }

  async function runChatCleanup() {
    if (
      !confirm(
        "Delete chat attachments older than 7 days?\n\nThe message text stays; only the attached files are removed from disk.",
      )
    )
      return;
    setBusy(true);
    setMsg(null);
    const r = await fetch("/api/chat/cleanup", { method: "POST" });
    setBusy(false);
    if (!r.ok) {
      const j = await r.json().catch(() => ({}));
      setMsg({ type: "err", text: j.error ?? "Cleanup failed" });
      return;
    }
    const j = await r.json();
    setMsg({
      type: "ok",
      text: `Cleanup done — deleted ${j.deletedFiles} file${j.deletedFiles === 1 ? "" : "s"} from ${j.clearedMessages} message${j.clearedMessages === 1 ? "" : "s"}.`,
    });
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Wand2 className="h-4 w-4 text-[var(--c-violet)]" /> Maintenance
        </CardTitle>
        <p className="text-xs text-slate-500 mt-1">
          One-click cleanup tasks. The chat-attachment cleanup also runs
          automatically (throttled to once per hour) whenever someone uploads a
          file.
        </p>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="flex items-start gap-3 flex-wrap">
          <Button
            variant="danger"
            size="sm"
            onClick={runChatCleanup}
            disabled={busy}
          >
            <Trash2 className="h-4 w-4" />
            {busy ? "Cleaning…" : "Clean chat attachments older than 7 days"}
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={runBackfillChannels}
            disabled={busy}
          >
            <Wand2 className="h-4 w-4" />
            {busy ? "Working…" : "Backfill missing team channels"}
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => runCalendarCleanup(true)}
            disabled={busy}
            title="Show what the calendar cleanup would do without changing anything"
          >
            <CalendarSync className="h-4 w-4" />
            {busy ? "Working…" : "Calendar cleanup — dry run"}
          </Button>
          <Button
            variant="danger"
            size="sm"
            onClick={() => runCalendarCleanup(false)}
            disabled={busy}
          >
            <CalendarSync className="h-4 w-4" />
            {busy ? "Working…" : "Calendar cleanup — apply"}
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => runOrphanEvents("report")}
            disabled={busy}
            title="List calendar events that belong to no student / General / researcher calendar"
          >
            <CalendarSync className="h-4 w-4" />
            {busy ? "Working…" : "Home-less events — diagnose"}
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => runOrphanEvents("rehome")}
            disabled={busy}
            title="Show General/team task deadlines under 'General only' instead of only 'All'"
          >
            <CalendarSync className="h-4 w-4" />
            {busy ? "Working…" : "Re-home task deadlines"}
          </Button>
          <Button
            variant="danger"
            size="sm"
            onClick={() => runOrphanEvents("delete")}
            disabled={busy}
          >
            <Trash2 className="h-4 w-4" />
            {busy ? "Working…" : "Delete home-less events"}
          </Button>
        </div>
        {msg && (
          <div
            className={
              msg.type === "ok"
                ? "text-sm text-[var(--c-green)] bg-green-50 rounded-lg p-3 whitespace-pre-wrap"
                : "text-sm text-[var(--c-red)] bg-red-50 rounded-lg p-3 whitespace-pre-wrap"
            }
          >
            {msg.text}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
