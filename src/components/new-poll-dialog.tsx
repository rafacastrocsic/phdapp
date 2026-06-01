"use client";
import { useState } from "react";
import { Plus, Trash2, BarChart3 } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export interface NewPoll {
  question: string;
  options: string[];
  multiVote: boolean;
  closesAt: string | null;
}

/**
 * Composer dialog for a new chat poll. Returns the validated payload
 * to the caller via onSubmit, which is responsible for actually
 * posting the chat message that carries the poll.
 *
 * Validation kept light here — the server is the source of truth
 * (zod schema mirrored), but we surface the easy errors inline so
 * users don't lose a half-typed poll on a server-side rejection.
 */
export function NewPollDialog({
  open,
  onOpenChange,
  onSubmit,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onSubmit: (poll: NewPoll) => Promise<void> | void;
}) {
  const [question, setQuestion] = useState("");
  const [options, setOptions] = useState<string[]>(["", ""]);
  const [multiVote, setMultiVote] = useState(false);
  // datetime-local value (no TZ suffix). Empty = no cutoff.
  const [closesAt, setClosesAt] = useState<string>("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  function reset() {
    setQuestion("");
    setOptions(["", ""]);
    setMultiVote(false);
    setClosesAt("");
    setError(null);
    setBusy(false);
  }

  function addOption() {
    if (options.length >= 10) return;
    setOptions((p) => [...p, ""]);
  }
  function removeOption(i: number) {
    if (options.length <= 2) return;
    setOptions((p) => p.filter((_, j) => j !== i));
  }
  function updateOption(i: number, v: string) {
    setOptions((p) => p.map((x, j) => (j === i ? v : x)));
  }

  async function submit() {
    setError(null);
    const q = question.trim();
    const opts = options.map((o) => o.trim()).filter((o) => o.length > 0);
    if (!q) return setError("Type a question.");
    if (opts.length < 2)
      return setError("Add at least 2 non-empty options.");
    const uniqLower = new Set(opts.map((o) => o.toLowerCase()));
    if (uniqLower.size !== opts.length)
      return setError("Two options have the same text.");
    let closesIso: string | null = null;
    if (closesAt) {
      const d = new Date(closesAt);
      if (Number.isNaN(d.getTime()))
        return setError("Couldn't parse the close date.");
      if (d <= new Date())
        return setError("Close date must be in the future.");
      closesIso = d.toISOString();
    }
    setBusy(true);
    try {
      await onSubmit({
        question: q,
        options: opts,
        multiVote,
        closesAt: closesIso,
      });
      reset();
      onOpenChange(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't create the poll.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        if (!v) reset();
        onOpenChange(v);
      }}
    >
      <DialogContent className="!max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <BarChart3 className="h-4 w-4" /> New poll
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-3">
          <label className="block">
            <span className="text-xs font-semibold text-slate-700">
              Question
            </span>
            <Input
              autoFocus
              value={question}
              onChange={(e) => setQuestion(e.target.value)}
              placeholder="e.g. Which slot works best for next week's 1:1?"
              maxLength={300}
              className="mt-1"
            />
          </label>

          <div>
            <span className="text-xs font-semibold text-slate-700">
              Options ({options.length}/10)
            </span>
            <ul className="mt-1 space-y-1.5">
              {options.map((o, i) => (
                <li key={i} className="flex items-center gap-2">
                  <Input
                    value={o}
                    onChange={(e) => updateOption(i, e.target.value)}
                    placeholder={`Option ${i + 1}`}
                    maxLength={120}
                  />
                  <button
                    type="button"
                    onClick={() => removeOption(i)}
                    disabled={options.length <= 2}
                    className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded text-slate-400 hover:bg-slate-100 hover:text-[var(--c-red)] disabled:cursor-not-allowed disabled:opacity-30"
                    title="Remove this option"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </li>
              ))}
            </ul>
            {options.length < 10 && (
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={addOption}
                className="mt-2"
              >
                <Plus className="h-3.5 w-3.5" /> Add option
              </Button>
            )}
          </div>

          <div className="grid grid-cols-2 gap-3">
            <label className="flex items-start gap-2">
              <input
                type="checkbox"
                checked={multiVote}
                onChange={(e) => setMultiVote(e.target.checked)}
                className="mt-0.5 h-4 w-4 rounded border-slate-300"
              />
              <span className="text-xs text-slate-700">
                <span className="font-semibold">Allow multiple</span>
                <span className="block text-[11px] text-slate-500">
                  Voters can pick more than one option.
                </span>
              </span>
            </label>
            <label className="block">
              <span className="text-xs font-semibold text-slate-700">
                Closes at <span className="text-slate-400">(optional)</span>
              </span>
              <Input
                type="datetime-local"
                value={closesAt}
                onChange={(e) => setClosesAt(e.target.value)}
                className="mt-1"
              />
            </label>
          </div>

          {error && (
            <div className="rounded-lg bg-red-50 p-2 text-xs text-[var(--c-red)]">
              {error}
            </div>
          )}
        </div>

        <div className="flex justify-end gap-2 pt-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => onOpenChange(false)}
            disabled={busy}
          >
            Cancel
          </Button>
          <Button
            type="button"
            variant="brand"
            size="sm"
            onClick={submit}
            disabled={busy}
          >
            {busy ? "Posting…" : "Post poll"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
