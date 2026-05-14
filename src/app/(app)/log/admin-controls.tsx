"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Download, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";

export function LogAdminControls() {
  const router = useRouter();
  const [busy, setBusy] = useState<"export" | "clear" | null>(null);

  async function onExport() {
    setBusy("export");
    try {
      const r = await fetch("/api/log/export");
      if (!r.ok) {
        const j = await r.json().catch(() => ({}));
        alert(j.error ?? "Export failed");
        return;
      }
      const text = await r.text();
      const blob = new Blob([text], { type: "text/markdown;charset=utf-8" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      const today = new Date().toISOString().slice(0, 10);
      a.href = url;
      a.download = `phdapp-log-${today}.md`;
      a.click();
      URL.revokeObjectURL(url);
    } finally {
      setBusy(null);
    }
  }

  async function onClear() {
    if (
      !confirm(
        "Permanently delete ALL entries in the Log Book?\n\nThis cannot be undone.",
      )
    )
      return;
    setBusy("clear");
    const r = await fetch("/api/log", { method: "DELETE" });
    setBusy(null);
    if (!r.ok) {
      const j = await r.json().catch(() => ({}));
      alert(j.error ?? "Could not clear log");
      return;
    }
    router.refresh();
  }

  return (
    <>
      <Button variant="outline" size="sm" onClick={onExport} disabled={busy !== null}>
        <Download className="h-4 w-4" />
        {busy === "export" ? "Exporting…" : "Export .md"}
      </Button>
      <Button variant="danger" size="sm" onClick={onClear} disabled={busy !== null}>
        <Trash2 className="h-4 w-4" />
        {busy === "clear" ? "Clearing…" : "Clear log"}
      </Button>
    </>
  );
}
