"use client";
import { useEffect, useMemo, useState } from "react";
import { Avatar } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Input, Textarea } from "@/components/ui/input";
import { cn, relativeTime } from "@/lib/utils";
import { CornerDownRight } from "lucide-react";

/**
 * Generic threaded comments — works for both Tasks (`/api/tickets/[id]/comments`)
 * and Events (`/api/calendar/events/[id]/comments`). Both endpoints share the
 * same JSON shape:
 *   { canModerate, comments: [{ id, body, parentId, author, createdAt, editedAt, mine }] }
 *   POST  body = { body, parentId? }     →  { comment }
 *   PATCH body = { body }                →  { comment }
 *   DELETE                                →  { ok: true }
 *
 * One level of nesting is rendered (children are indented under their parent).
 * Deeper replies all share the top-level thread; the UI keeps it readable.
 */
type C = {
  id: string;
  body: string;
  parentId: string | null;
  author: { name: string | null; image: string | null; color: string };
  createdAt: string;
  editedAt: string | null;
  mine: boolean;
};

export function CommentsThread({
  apiBase,
  initialCount,
  emptyHint = "No comments yet.",
  composerPlaceholder = "Add a comment…",
}: {
  /** e.g. `/api/tickets/<id>/comments` or `/api/calendar/events/<id>/comments` */
  apiBase: string;
  /** badge in the heading (renders before fetch completes) */
  initialCount?: number;
  emptyHint?: string;
  composerPlaceholder?: string;
}) {
  const [items, setItems] = useState<C[] | null>(null);
  const [canModerate, setCanModerate] = useState(false);
  const [body, setBody] = useState("");
  const [loaded, setLoaded] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editText, setEditText] = useState("");
  const [replyTo, setReplyTo] = useState<string | null>(null);
  const [replyText, setReplyText] = useState("");
  const [sending, setSending] = useState(false);

  async function load() {
    const r = await fetch(apiBase);
    if (!r.ok) return;
    const j = await r.json();
    setItems(j.comments);
    setCanModerate(!!j.canModerate);
    setLoaded(true);
  }
  useEffect(() => {
    void load();
    // intentionally one-shot per mount; the parent dialog refetches on reopen
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [apiBase]);

  async function send(e: React.FormEvent) {
    e.preventDefault();
    if (!body.trim()) return;
    setSending(true);
    const r = await fetch(apiBase, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ body }),
    });
    setSending(false);
    if (!r.ok) return;
    const { comment } = await r.json();
    setItems((prev) => [...(prev ?? []), comment]);
    setBody("");
  }

  async function sendReply(parentId: string) {
    const text = replyText.trim();
    if (!text) return;
    setSending(true);
    const r = await fetch(apiBase, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ body: text, parentId }),
    });
    setSending(false);
    if (!r.ok) return;
    const { comment } = await r.json();
    setItems((prev) => [...(prev ?? []), comment]);
    setReplyTo(null);
    setReplyText("");
  }

  async function saveEdit(id: string) {
    const text = editText.trim();
    if (!text) return;
    const r = await fetch(`${apiBase}/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ body: text }),
    });
    if (!r.ok) return;
    const { comment } = await r.json();
    setItems((prev) =>
      (prev ?? []).map((c) => (c.id === id ? { ...c, ...comment } : c)),
    );
    setEditingId(null);
    setEditText("");
  }

  async function remove(id: string) {
    if (!window.confirm("Delete this comment?")) return;
    const r = await fetch(`${apiBase}/${id}`, { method: "DELETE" });
    if (r.ok)
      // Also drop any replies that cascaded server-side, to keep UI in sync.
      setItems((prev) =>
        (prev ?? []).filter((c) => c.id !== id && c.parentId !== id),
      );
  }

  // Group: top-level → its replies (1 level deep).
  const grouped = useMemo(() => {
    const list = items ?? [];
    const byParent = new Map<string, C[]>();
    for (const c of list) {
      if (c.parentId) {
        const arr = byParent.get(c.parentId) ?? [];
        arr.push(c);
        byParent.set(c.parentId, arr);
      }
    }
    const tops = list
      .filter((c) => !c.parentId)
      .sort((a, b) => a.createdAt.localeCompare(b.createdAt));
    return tops.map((t) => ({
      top: t,
      replies: (byParent.get(t.id) ?? []).sort((a, b) =>
        a.createdAt.localeCompare(b.createdAt),
      ),
    }));
  }, [items]);

  const totalCount = items?.length ?? initialCount ?? 0;

  function renderOne(c: C, isReply: boolean) {
    return (
      <div key={c.id} className="flex gap-2 group">
        {isReply && (
          <CornerDownRight className="mt-2 h-3.5 w-3.5 shrink-0 text-slate-300" />
        )}
        <Avatar
          name={c.author.name}
          src={c.author.image}
          color={c.author.color}
          size="xs"
        />
        <div className="flex-1 rounded-lg bg-slate-50 p-2 text-sm min-w-0">
          <div className="flex items-center justify-between gap-2 flex-wrap">
            <div className="text-[10px] font-semibold text-slate-500">
              {c.author.name} · {relativeTime(c.createdAt)}
              {c.editedAt && (
                <span
                  className="ml-1 italic text-slate-400"
                  title={`Edited ${relativeTime(c.editedAt)}`}
                >
                  (edited)
                </span>
              )}
            </div>
            {editingId !== c.id && (
              <div className="flex gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                {/* Only top-level comments accept replies (1 level deep). */}
                {!isReply && (
                  <button
                    type="button"
                    onClick={() => {
                      setReplyTo(c.id === replyTo ? null : c.id);
                      setReplyText("");
                    }}
                    className="text-[10px] font-semibold text-slate-400 hover:text-slate-700"
                  >
                    Reply
                  </button>
                )}
                {c.mine && (
                  <button
                    type="button"
                    onClick={() => {
                      setEditingId(c.id);
                      setEditText(c.body);
                    }}
                    className="text-[10px] font-semibold text-slate-400 hover:text-slate-700"
                  >
                    Edit
                  </button>
                )}
                {(c.mine || canModerate) && (
                  <button
                    type="button"
                    onClick={() => remove(c.id)}
                    className="text-[10px] font-semibold text-slate-400 hover:text-[var(--c-red)]"
                  >
                    Delete
                  </button>
                )}
              </div>
            )}
          </div>
          {editingId === c.id ? (
            <div className="mt-1 space-y-1.5">
              <Textarea
                rows={2}
                value={editText}
                onChange={(e) => setEditText(e.target.value)}
              />
              <div className="flex justify-end gap-2">
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    setEditingId(null);
                    setEditText("");
                  }}
                >
                  Cancel
                </Button>
                <Button
                  type="button"
                  variant="brand"
                  size="sm"
                  disabled={!editText.trim()}
                  onClick={() => saveEdit(c.id)}
                >
                  Save
                </Button>
              </div>
            </div>
          ) : (
            <div className="text-slate-800 whitespace-pre-wrap [overflow-wrap:anywhere]">
              {c.body}
            </div>
          )}
        </div>
      </div>
    );
  }

  return (
    <div>
      <div className="text-xs font-semibold uppercase text-slate-500 mb-2">
        Comments {loaded ? `(${totalCount})` : ""}
      </div>
      <div className="space-y-2 max-h-60 overflow-y-auto pr-1">
        {grouped.map(({ top, replies }) => (
          <div key={top.id} className="space-y-1.5">
            {renderOne(top, false)}
            {replies.length > 0 && (
              <div className="ml-8 space-y-1.5">
                {replies.map((r) => renderOne(r, true))}
              </div>
            )}
            {replyTo === top.id && (
              <div className="ml-8 space-y-1.5">
                <Textarea
                  rows={2}
                  placeholder="Write a reply…"
                  value={replyText}
                  onChange={(e) => setReplyText(e.target.value)}
                />
                <div className="flex justify-end gap-2">
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => {
                      setReplyTo(null);
                      setReplyText("");
                    }}
                  >
                    Cancel
                  </Button>
                  <Button
                    type="button"
                    variant="brand"
                    size="sm"
                    disabled={sending || !replyText.trim()}
                    onClick={() => sendReply(top.id)}
                  >
                    {sending ? "Sending…" : "Reply"}
                  </Button>
                </div>
              </div>
            )}
          </div>
        ))}
        {loaded && grouped.length === 0 && (
          <p className="text-xs text-slate-400 italic">{emptyHint}</p>
        )}
      </div>
      <form
        onSubmit={send}
        className={cn(
          "mt-3 flex gap-2",
          grouped.length === 0 && "mt-2",
        )}
      >
        <Input
          value={body}
          onChange={(e) => setBody(e.target.value)}
          placeholder={composerPlaceholder}
        />
        <Button
          type="submit"
          variant="default"
          size="sm"
          disabled={sending || !body.trim()}
        >
          Send
        </Button>
      </form>
    </div>
  );
}
