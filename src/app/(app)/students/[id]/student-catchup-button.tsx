"use client";
import { useState } from "react";
import { Sparkles, Copy, Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

// Non-students get a one-click read-only digest of where the student is
// at (tasks, events, thesis, publications, latest check-in).
export function StudentCatchupButton({ studentId }: { studentId: string }) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [text, setText] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  async function load() {
    setOpen(true);
    setLoading(true);
    setError(null);
    setText(null);
    setCopied(false);
    try {
      const r = await fetch(`/api/students/${studentId}/summary`, {
        cache: "no-store",
      });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) {
        setError(j.error ?? "Could not build the summary.");
      } else {
        setText(j.text as string);
      }
    } catch {
      setError("Could not build the summary.");
    } finally {
      setLoading(false);
    }
  }

  async function copy() {
    if (!text) return;
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // ignore — clipboard may be blocked
    }
  }

  return (
    <>
      <Button variant="outline" size="sm" onClick={load}>
        <Sparkles className="h-4 w-4" />
        Catch-up
      </Button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="!max-w-2xl">
          <DialogHeader>
            <DialogTitle>Catch-up summary</DialogTitle>
          </DialogHeader>

          {loading && (
            <div className="py-10 text-center text-sm text-slate-500">
              Building summary…
            </div>
          )}
          {error && (
            <div className="text-sm text-[var(--c-red)] bg-red-50 rounded-lg p-3">
              {error}
            </div>
          )}
          {text && (
            <>
              <pre className="max-h-[60vh] overflow-auto whitespace-pre-wrap rounded-lg border bg-slate-50 p-4 text-[13px] leading-relaxed text-slate-800 font-sans">
                {text}
              </pre>
              <div className="flex justify-end gap-2 pt-2">
                <Button variant="outline" size="sm" onClick={copy}>
                  {copied ? (
                    <>
                      <Check className="h-4 w-4" /> Copied
                    </>
                  ) : (
                    <>
                      <Copy className="h-4 w-4" /> Copy
                    </>
                  )}
                </Button>
                <Button
                  variant="brand"
                  size="sm"
                  onClick={() => setOpen(false)}
                >
                  Close
                </Button>
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
