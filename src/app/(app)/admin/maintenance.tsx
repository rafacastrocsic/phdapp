"use client";
import { useState } from "react";
import { Trash2, Wand2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export function MaintenanceTools() {
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ type: "ok" | "err"; text: string } | null>(null);

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
