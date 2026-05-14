"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { FolderOpen, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";

export function DriveShareButton({
  studentId,
  hasFolder,
}: {
  studentId: string;
  hasFolder: boolean;
}) {
  const [busy, setBusy] = useState(false);
  const router = useRouter();

  async function run() {
    if (
      hasFolder &&
      !confirm(
        "Re-sync sharing for this Drive folder? Adds the supervisor team as writers.",
      )
    )
      return;
    if (!hasFolder && !confirm(
      "Create a new shared Drive folder in your Google account?\n\n" +
        "Your supervisors will be granted writer access automatically. " +
        "The folder id will be saved on your profile so PhDapp uses it for the Files module.",
    ))
      return;
    setBusy(true);
    const r = await fetch(`/api/students/${studentId}/drive`, { method: "POST" });
    setBusy(false);
    if (!r.ok) {
      const j = await r.json().catch(() => ({}));
      alert(j.error ?? "Could not provision Drive folder");
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
      {hasFolder ? (
        <>
          <FolderOpen className="h-4 w-4" /> {busy ? "Syncing…" : "Sync Drive sharing"}
        </>
      ) : (
        <>
          <Sparkles className="h-4 w-4" /> {busy ? "Creating…" : "Create shared Drive folder"}
        </>
      )}
    </Button>
  );
}
