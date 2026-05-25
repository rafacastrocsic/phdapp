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
    const ophs = (j.orphans ?? []).length;
    setMsg({
      type: "ok",
      text: dryRun
        ? `Dry-run: would delete ${dup} duplicate + ${dangling} dangling event row(s), would re-sync ${ophs} task(s) to Google. Re-run without dry-run to apply.`
        : `Cleanup done — removed ${dup + dangling} event row(s), re-synced ${ophs} task(s). Refresh the Calendar to see the result.`,
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
        </div>
        {msg && (
          <div
            className={
              msg.type === "ok"
                ? "text-sm text-[var(--c-green)] bg-green-50 rounded-lg p-3"
                : "text-sm text-[var(--c-red)] bg-red-50 rounded-lg p-3"
            }
          >
            {msg.text}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
