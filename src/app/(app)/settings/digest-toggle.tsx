"use client";
import { useState } from "react";

export function DigestToggle({ initial }: { initial: boolean }) {
  const [on, setOn] = useState(initial);
  const [busy, setBusy] = useState(false);

  async function toggle() {
    const next = !on;
    setOn(next);
    setBusy(true);
    await fetch("/api/me/email-digest", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ emailDigest: next }),
    });
    setBusy(false);
  }

  return (
    <label className="flex items-center gap-3 text-sm text-slate-700">
      <input
        type="checkbox"
        checked={on}
        disabled={busy}
        onChange={toggle}
        className="h-4 w-4 rounded"
      />
      Email me the weekly supervision summary (overdue tasks, reading
      approvals, check-ins, wellbeing flags)
    </label>
  );
}
