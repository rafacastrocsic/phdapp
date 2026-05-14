"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { CalendarDays, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";

export function CalendarShareButton({
  studentId,
  hasCalendar,
}: {
  studentId: string;
  hasCalendar: boolean;
}) {
  const [busy, setBusy] = useState(false);
  const router = useRouter();

  async function run() {
    if (
      hasCalendar &&
      !confirm(
        "Re-sync sharing for this student's calendar? Adds the supervisor team + student as writers.",
      )
    )
      return;
    if (!hasCalendar && !confirm(
      "Create a new shared Google Calendar in your account for this student?\n\n" +
        "The student and any co-supervisors will be granted writer access automatically. " +
        "The calendar id will be saved on the student's profile so all PhDapp events use it.",
    ))
      return;
    setBusy(true);
    const r = await fetch(`/api/students/${studentId}/calendar`, {
      method: "POST",
    });
    setBusy(false);
    if (!r.ok) {
      const j = await r.json().catch(() => ({}));
      alert(j.error ?? "Could not provision calendar");
      return;
    }
    const j = await r.json();
    if (j.warning) {
      alert(j.warning);
    } else {
      const fail = (j.failed ?? []).length;
      alert(
        `Done — ${j.shared} member${j.shared === 1 ? "" : "s"} have writer access${fail ? ` (${fail} failed)` : ""}.`,
      );
    }
    router.refresh();
  }

  return (
    <Button variant="outline" size="sm" onClick={run} disabled={busy}>
      {hasCalendar ? (
        <>
          <CalendarDays className="h-4 w-4" /> {busy ? "Syncing…" : "Sync sharing"}
        </>
      ) : (
        <>
          <Sparkles className="h-4 w-4" /> {busy ? "Creating…" : "Create shared calendar"}
        </>
      )}
    </Button>
  );
}
