"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { ClipboardCheck, Check } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

interface CheckinData {
  did: string | null;
  blockers: string | null;
  next: string | null;
  wellbeing: number | null;
}

export function WeeklyCheckinCard({
  studentId,
  initial,
}: {
  studentId: string;
  initial: CheckinData | null;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(!initial);
  const [did, setDid] = useState(initial?.did ?? "");
  const [blockers, setBlockers] = useState(initial?.blockers ?? "");
  const [next, setNext] = useState(initial?.next ?? "");
  const [wellbeing, setWellbeing] = useState<number | null>(
    initial?.wellbeing ?? null,
  );
  const [saved, setSaved] = useState(!!initial);
  const [busy, setBusy] = useState(false);

  async function submit() {
    setBusy(true);
    const r = await fetch(`/api/students/${studentId}/checkins`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        did: did.trim() || null,
        blockers: blockers.trim() || null,
        next: next.trim() || null,
        wellbeing,
      }),
    });
    setBusy(false);
    if (r.ok) {
      setSaved(true);
      setOpen(false);
      router.refresh();
    }
  }

  return (
    <Card className="border-[var(--c-violet)]/30">
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle className="flex items-center gap-2 text-[var(--c-violet)]">
          <ClipboardCheck className="h-4 w-4" />
          Weekly check-in
          {saved && !open && (
            <span className="text-xs font-normal text-[var(--c-green)] inline-flex items-center gap-1">
              <Check className="h-3.5 w-3.5" /> submitted this week
            </span>
          )}
        </CardTitle>
        <Button
          type="button"
          size="sm"
          variant="outline"
          onClick={() => setOpen((o) => !o)}
        >
          {open ? "Hide" : saved ? "Edit" : "Fill in"}
        </Button>
      </CardHeader>
      {open && (
        <CardContent className="space-y-3">
          <p className="text-[11px] text-slate-500">
            ~2 minutes. Your supervisors read this; the wellbeing dial is only
            visible to supervisors.
          </p>
          <Field label="What did you get done this week?">
            <textarea
              value={did}
              onChange={(e) => setDid(e.target.value)}
              rows={2}
              className="w-full rounded-lg border bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[var(--c-violet)]/30 resize-y"
            />
          </Field>
          <Field label="Anything blocking you?">
            <textarea
              value={blockers}
              onChange={(e) => setBlockers(e.target.value)}
              rows={2}
              className="w-full rounded-lg border bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[var(--c-violet)]/30 resize-y"
            />
          </Field>
          <Field label="Plan for next week">
            <textarea
              value={next}
              onChange={(e) => setNext(e.target.value)}
              rows={2}
              className="w-full rounded-lg border bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[var(--c-violet)]/30 resize-y"
            />
          </Field>
          <Field label="How are you doing? (only supervisors see this)">
            <div className="flex gap-1.5">
              {[1, 2, 3, 4, 5].map((n) => (
                <button
                  key={n}
                  type="button"
                  onClick={() => setWellbeing(n === wellbeing ? null : n)}
                  className={cn(
                    "h-9 w-9 rounded-lg border text-sm font-semibold transition-colors",
                    wellbeing === n
                      ? "bg-[var(--c-violet)] text-white border-[var(--c-violet)]"
                      : "bg-white text-slate-500 hover:bg-slate-50",
                  )}
                  title={
                    ["Struggling", "Low", "OK", "Good", "Great"][n - 1]
                  }
                >
                  {n}
                </button>
              ))}
            </div>
          </Field>
          <div className="flex justify-end">
            <Button
              type="button"
              variant="brand"
              onClick={submit}
              disabled={busy}
            >
              {busy ? "Saving…" : saved ? "Update check-in" : "Submit check-in"}
            </Button>
          </div>
        </CardContent>
      )}
    </Card>
  );
}

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <label className="block">
      <span className="text-xs font-semibold text-slate-700">{label}</span>
      <div className="mt-1">{children}</div>
    </label>
  );
}
