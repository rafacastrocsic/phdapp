"use client";
import { useEffect, useState } from "react";
import { Plus, Trash2, BarChart3, Lock } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { Poll } from "@/components/poll-card";

/**
 * EditPollDialog — for the poll author (or admin) to amend a poll
 * after creation. Enforces the same locking rules as the server:
 *
 *   - If ANY vote has been cast, question + option text +
 *     multi-vote toggle are read-only (anti-manipulation rule).
 *   - Removing an option requires that option to have zero votes
 *     (regardless of global hasAnyVote).
 *   - Adding options / changing closesAt are editable any time.
 *
 * Computes the diff client-side and sends a single PATCH that the
 * server validates again — the UI hints are advisory.
 */
export function EditPollDialog({
  open,
  onOpenChange,
  poll,
  onUpdated,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  poll: Poll;
  onUpdated: (next: Poll) => void;
}) {
  // Did anyone vote? Drives whether structural fields are read-only.
  const totalVotes = poll.options.reduce(
    (sum, o) => sum + o.votes.length,
    0,
  );
  const hasAnyVote = totalVotes > 0;

  const [question, setQuestion] = useState(poll.question);
  const [multiVote, setMultiVote] = useState(poll.multiVote);
  // datetime-local value (no TZ suffix); empty = no cutoff.
  const [closesAt, setClosesAt] = useState<string>(
    poll.closesAt ? toLocalInputValue(new Date(poll.closesAt)) : "",
  );
  // Working copy of options: existing ones carry their server id,
  // newly-added ones are id-less until submit.
  type Row = { id: string | null; text: string; voteCount: number };
  const [rows, setRows] = useState<Row[]>(
    poll.options.map((o) => ({
      id: o.id,
      text: o.text,
      voteCount: o.votes.length,
    })),
  );
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  // Re-seed state whenever the dialog opens with a (possibly
  // different) poll — otherwise reopening the same dialog after an
  // edit keeps the stale fields.
  useEffect(() => {
    if (!open) return;
    setQuestion(poll.question);
    setMultiVote(poll.multiVote);
    setClosesAt(
      poll.closesAt ? toLocalInputValue(new Date(poll.closesAt)) : "",
    );
    setRows(
      poll.options.map((o) => ({
        id: o.id,
        text: o.text,
        voteCount: o.votes.length,
      })),
    );
    setError(null);
    setBusy(false);
  }, [open, poll]);

  function addRow() {
    if (rows.length >= 10) return;
    setRows((p) => [...p, { id: null, text: "", voteCount: 0 }]);
  }
  function removeRow(idx: number) {
    setRows((p) => p.filter((_, i) => i !== idx));
  }
  function updateRowText(idx: number, v: string) {
    setRows((p) => p.map((r, i) => (i === idx ? { ...r, text: v } : r)));
  }

  async function submit() {
    setError(null);
    const q = question.trim();
    if (!q) return setError("Type a question.");
    const cleaned = rows
      .map((r) => ({ ...r, text: r.text.trim() }))
      .filter((r) => r.text.length > 0);
    if (cleaned.length < 2)
      return setError("A poll needs at least 2 non-empty options.");
    const lowerSet = new Set(cleaned.map((r) => r.text.toLowerCase()));
    if (lowerSet.size !== cleaned.length)
      return setError("Two options have the same text.");

    // ─── Compute the diff against the original poll ───
    const body: Record<string, unknown> = {};

    if (q !== poll.question.trim()) body.question = q;
    if (multiVote !== poll.multiVote) body.multiVote = multiVote;

    let closesIso: string | null = null;
    if (closesAt) {
      const d = new Date(closesAt);
      if (Number.isNaN(d.getTime()))
        return setError("Couldn't parse the close date.");
      closesIso = d.toISOString();
    }
    const origCloses = poll.closesAt ?? null;
    if (closesIso !== origCloses) body.closesAt = closesIso;

    // Removed options = ones that were in `poll.options` but aren't
    // in the current rows by id.
    const remainingIds = new Set(
      cleaned.map((r) => r.id).filter((x): x is string => !!x),
    );
    const removeOptionIds = poll.options
      .filter((o) => !remainingIds.has(o.id))
      .map((o) => o.id);

    // Refuse to submit if the user is trying to remove an option
    // that has votes — server rejects, UI surfaces it earlier.
    for (const removedId of removeOptionIds) {
      const orig = poll.options.find((o) => o.id === removedId);
      if (orig && orig.votes.length > 0)
        return setError(
          `Can't remove "${orig.text}" — it already has votes.`,
        );
    }
    if (removeOptionIds.length > 0) body.removeOptionIds = removeOptionIds;

    // Added options = rows without an id.
    const addOptions = cleaned.filter((r) => !r.id).map((r) => r.text);
    if (addOptions.length > 0) body.addOptions = addOptions;

    // Edited option text = rows with an id whose text changed.
    const editOptionText = cleaned
      .filter((r) => r.id)
      .filter((r) => {
        const orig = poll.options.find((o) => o.id === r.id);
        return orig && orig.text !== r.text;
      })
      .map((r) => ({ id: r.id as string, text: r.text }));
    if (editOptionText.length > 0) body.editOptionText = editOptionText;

    if (Object.keys(body).length === 0) {
      // Nothing changed — close silently.
      onOpenChange(false);
      return;
    }

    setBusy(true);
    try {
      const r = await fetch(`/api/polls/${poll.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!r.ok) {
        const j = await r.json().catch(() => ({}));
        setError(j.error ?? "Couldn't save the changes.");
        return;
      }
      const j = await r.json();
      if (j.poll) onUpdated(j.poll as Poll);
      onOpenChange(false);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="!max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <BarChart3 className="h-4 w-4" /> Edit poll
          </DialogTitle>
        </DialogHeader>

        {hasAnyVote && (
          <div className="flex items-start gap-2 rounded-lg bg-amber-50 p-2 text-[11px] text-amber-800">
            <Lock className="mt-0.5 h-3.5 w-3.5 shrink-0" />
            <span>
              {totalVotes} vote{totalVotes === 1 ? "" : "s"} already cast. The
              question, existing option text, and multi-vote setting are
              locked. You can still <strong>add new options</strong>, change
              the close date, or remove options that have zero votes.
            </span>
          </div>
        )}

        <div className="space-y-3">
          <label className="block">
            <span className="text-xs font-semibold text-slate-700">
              Question
            </span>
            <Input
              value={question}
              onChange={(e) => setQuestion(e.target.value)}
              maxLength={300}
              disabled={hasAnyVote}
              className="mt-1"
            />
          </label>

          <div>
            <span className="text-xs font-semibold text-slate-700">
              Options ({rows.length}/10)
            </span>
            <ul className="mt-1 space-y-1.5">
              {rows.map((r, i) => {
                const isExisting = !!r.id;
                const hasVotes = r.voteCount > 0;
                // text is read-only on existing options if anyone has
                // voted ANYWHERE on the poll (per the server rule).
                const textLocked = hasAnyVote && isExisting;
                // remove is allowed if the row is new (no id yet) OR
                // it's an existing option with zero votes on it.
                const canRemove = !isExisting || !hasVotes;
                return (
                  <li key={r.id ?? `new-${i}`} className="flex items-center gap-2">
                    <Input
                      value={r.text}
                      onChange={(e) => updateRowText(i, e.target.value)}
                      placeholder={`Option ${i + 1}`}
                      maxLength={120}
                      disabled={textLocked}
                    />
                    {hasVotes && (
                      <span
                        title="This option has votes — can't be removed."
                        className="shrink-0 rounded-full bg-violet-100 px-1.5 py-0.5 text-[10px] font-semibold text-violet-700"
                      >
                        {r.voteCount} vote{r.voteCount === 1 ? "" : "s"}
                      </span>
                    )}
                    <button
                      type="button"
                      onClick={() => removeRow(i)}
                      disabled={!canRemove}
                      className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded text-slate-400 hover:bg-slate-100 hover:text-[var(--c-red)] disabled:cursor-not-allowed disabled:opacity-30"
                      title={
                        canRemove
                          ? "Remove this option"
                          : "Has votes — can't remove"
                      }
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </li>
                );
              })}
            </ul>
            {rows.length < 10 && (
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={addRow}
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
                disabled={hasAnyVote}
                className="mt-0.5 h-4 w-4 rounded border-slate-300 disabled:opacity-50"
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
            {busy ? "Saving…" : "Save changes"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

/** Convert a Date to the local-tz string `<input type="datetime-local">` wants. */
function toLocalInputValue(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return (
    `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}` +
    `T${pad(d.getHours())}:${pad(d.getMinutes())}`
  );
}
