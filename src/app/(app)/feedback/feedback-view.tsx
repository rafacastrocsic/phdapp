"use client";
import { useMemo, useState } from "react";
import { Megaphone, Bug, Lightbulb, MessageSquare, Trash2 } from "lucide-react";
import { Avatar } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input, Select, Textarea } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { cn, relativeTime } from "@/lib/utils";

type Kind = "bug" | "idea" | "other";

type Item = {
  id: string;
  kind: string;
  subject: string;
  body: string;
  status: string;
  adminReply: string | null;
  repliedBy: { id: string; name: string | null } | null;
  repliedAt: string | null;
  createdAt: string;
  updatedAt: string;
  author: { id: string; name: string | null; image: string | null; color: string } | null;
  mine: boolean;
};

const KIND_META: Record<string, { label: string; color: string; icon: typeof Bug }> = {
  bug: { label: "Bug", color: "var(--c-red)", icon: Bug },
  idea: { label: "Suggestion", color: "var(--c-violet)", icon: Lightbulb },
  other: { label: "Other", color: "#64748b", icon: MessageSquare },
};

const STATUS_META: Record<string, { label: string; color: string }> = {
  open: { label: "Open", color: "#64748b" },
  planned: { label: "Planned", color: "var(--c-blue)" },
  in_progress: { label: "In progress", color: "var(--c-orange)" },
  done: { label: "Done", color: "var(--c-green)" },
  declined: { label: "Declined", color: "var(--c-red)" },
};
const STATUS_ORDER = ["open", "planned", "in_progress", "done", "declined"];

export function FeedbackView({
  isAdmin,
  initialItems,
}: {
  isAdmin: boolean;
  initialItems: Item[];
}) {
  const [items, setItems] = useState<Item[]>(initialItems);
  const [kind, setKind] = useState<Kind>("idea");
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [statusFilter, setStatusFilter] = useState("");
  const [kindFilter, setKindFilter] = useState("");

  async function refresh() {
    const r = await fetch("/api/feedback", { cache: "no-store" });
    if (r.ok) {
      const j = await r.json();
      setItems(j.items as Item[]);
    }
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!subject.trim() || !body.trim()) {
      setError("Add a subject and a message.");
      return;
    }
    setSubmitting(true);
    setError(null);
    const r = await fetch("/api/feedback", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ kind, subject: subject.trim(), body: body.trim() }),
    });
    setSubmitting(false);
    if (!r.ok) {
      const j = await r.json().catch(() => ({}));
      setError(j.error ?? "Could not send. Try again.");
      return;
    }
    setSubject("");
    setBody("");
    setKind("idea");
    await refresh();
  }

  const filtered = useMemo(
    () =>
      items.filter(
        (f) =>
          (!statusFilter || f.status === statusFilter) &&
          (!kindFilter || f.kind === kindFilter),
      ),
    [items, statusFilter, kindFilter],
  );

  async function patch(id: string, data: Record<string, unknown>) {
    setItems((prev) =>
      prev.map((f) => (f.id === id ? { ...f, ...data } : f)),
    );
    await fetch(`/api/feedback/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    }).catch(() => {});
  }

  async function remove(id: string) {
    if (!confirm("Delete this feedback?")) return;
    setItems((prev) => prev.filter((f) => f.id !== id));
    await fetch(`/api/feedback/${id}`, { method: "DELETE" }).catch(() => {});
  }

  return (
    <div className="flex-1 min-w-0 overflow-auto p-6 lg:p-8 space-y-6">
      <div>
        <h1 className="flex items-center gap-2 text-2xl font-bold text-slate-900">
          <Megaphone className="h-6 w-6 text-[var(--c-violet)]" />
          Feedback &amp; suggestions
        </h1>
        <p className="text-sm text-slate-500 mt-1">
          {isAdmin
            ? "Everything users have sent in — triage, set a status, and reply."
            : "Spotted a bug or have an idea to improve PhDapp? Send it straight to the admins. You'll see their replies here."}
        </p>
      </div>

      {/* Composer */}
      <Card>
        <CardContent className="pt-5">
          <form onSubmit={submit} className="space-y-3">
            <div className="flex flex-wrap gap-2">
              {(Object.keys(KIND_META) as Kind[]).map((k) => {
                const M = KIND_META[k];
                const Icon = M.icon;
                const active = kind === k;
                return (
                  <button
                    key={k}
                    type="button"
                    onClick={() => setKind(k)}
                    className={cn(
                      "flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-sm font-medium transition-colors",
                      active
                        ? "text-white"
                        : "bg-white text-slate-600 hover:bg-slate-50",
                    )}
                    style={active ? { background: M.color, borderColor: M.color } : undefined}
                  >
                    <Icon className="h-4 w-4" />
                    {M.label}
                  </button>
                );
              })}
            </div>
            <Input
              placeholder="Short summary"
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              maxLength={160}
            />
            <Textarea
              rows={4}
              placeholder={
                kind === "bug"
                  ? "What happened, what you expected, and how to reproduce it…"
                  : "Describe your idea or feedback…"
              }
              value={body}
              onChange={(e) => setBody(e.target.value)}
              maxLength={5000}
            />
            {error && (
              <div className="text-sm text-[var(--c-red)] bg-red-50 rounded-lg p-3">
                {error}
              </div>
            )}
            <div className="flex justify-end">
              <Button type="submit" variant="brand" disabled={submitting}>
                {submitting ? "Sending…" : "Send to admins"}
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>

      {isAdmin && (
        <div className="flex flex-wrap gap-2">
          <Select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="!w-auto"
          >
            <option value="">Any status</option>
            {STATUS_ORDER.map((s) => (
              <option key={s} value={s}>
                {STATUS_META[s].label}
              </option>
            ))}
          </Select>
          <Select
            value={kindFilter}
            onChange={(e) => setKindFilter(e.target.value)}
            className="!w-auto"
          >
            <option value="">Any type</option>
            {Object.keys(KIND_META).map((k) => (
              <option key={k} value={k}>
                {KIND_META[k].label}
              </option>
            ))}
          </Select>
        </div>
      )}

      <div className="space-y-3">
        {filtered.length === 0 && (
          <p className="text-sm text-slate-400">
            {isAdmin
              ? "No feedback yet."
              : "You haven't sent any feedback yet."}
          </p>
        )}
        {filtered.map((f) => {
          const KM = KIND_META[f.kind] ?? KIND_META.other;
          const SM = STATUS_META[f.status] ?? STATUS_META.open;
          return (
            <Card key={f.id}>
              <CardContent className="pt-5 space-y-3">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge color={KM.color} variant="soft">
                        {KM.label}
                      </Badge>
                      <Badge color={SM.color} variant="solid">
                        {SM.label}
                      </Badge>
                      <span className="text-xs text-slate-400">
                        {relativeTime(f.createdAt)}
                      </span>
                    </div>
                    <h3 className="mt-1.5 font-semibold text-slate-900">
                      {f.subject}
                    </h3>
                  </div>
                  {(isAdmin || f.mine) && (
                    <button
                      type="button"
                      onClick={() => remove(f.id)}
                      title="Delete"
                      className="shrink-0 rounded-md p-1.5 text-slate-400 hover:bg-slate-100 hover:text-[var(--c-red)]"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  )}
                </div>

                <p className="whitespace-pre-wrap text-sm text-slate-700">
                  {f.body}
                </p>

                {isAdmin && f.author && (
                  <div className="flex items-center gap-2 text-xs text-slate-500">
                    <Avatar
                      name={f.author.name}
                      src={f.author.image}
                      color={f.author.color}
                      size="xs"
                    />
                    From {f.author.name ?? "Unknown"}
                  </div>
                )}

                {/* Admin controls */}
                {isAdmin ? (
                  <div className="rounded-lg border bg-slate-50 p-3 space-y-2">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-xs font-semibold text-slate-600">
                        Status
                      </span>
                      <Select
                        value={f.status}
                        onChange={(e) =>
                          patch(f.id, { status: e.target.value })
                        }
                        className="!w-auto"
                      >
                        {STATUS_ORDER.map((s) => (
                          <option key={s} value={s}>
                            {STATUS_META[s].label}
                          </option>
                        ))}
                      </Select>
                    </div>
                    <AdminReply
                      initial={f.adminReply ?? ""}
                      onSave={(text) => patch(f.id, { adminReply: text || null })}
                    />
                    {f.repliedBy && f.repliedAt && (
                      <p className="text-[11px] text-slate-400">
                        Last reply by {f.repliedBy.name ?? "an admin"} ·{" "}
                        {relativeTime(f.repliedAt)}
                      </p>
                    )}
                  </div>
                ) : (
                  f.adminReply && (
                    <div className="rounded-lg border-l-2 border-[var(--c-violet)] bg-violet-50 p-3">
                      <div className="text-[11px] font-semibold text-[var(--c-violet)]">
                        Admin reply
                        {f.repliedAt ? ` · ${relativeTime(f.repliedAt)}` : ""}
                      </div>
                      <p className="mt-1 whitespace-pre-wrap text-sm text-slate-700">
                        {f.adminReply}
                      </p>
                    </div>
                  )
                )}
              </CardContent>
            </Card>
          );
        })}
      </div>
    </div>
  );
}

function AdminReply({
  initial,
  onSave,
}: {
  initial: string;
  onSave: (text: string) => void;
}) {
  const [text, setText] = useState(initial);
  const dirty = text !== initial;
  return (
    <div className="space-y-2">
      <Textarea
        rows={2}
        placeholder="Write a reply to the submitter (optional)…"
        value={text}
        onChange={(e) => setText(e.target.value)}
      />
      <div className="flex justify-end">
        <Button
          type="button"
          size="sm"
          variant="outline"
          disabled={!dirty}
          onClick={() => onSave(text.trim())}
        >
          Save reply
        </Button>
      </div>
    </div>
  );
}
