"use client";
import { useEffect, useMemo, useState } from "react";
import { Avatar } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Input, Textarea } from "@/components/ui/input";
import { cn, relativeTime } from "@/lib/utils";
import { linkify } from "@/lib/linkify";
import { CornerDownRight, FileText } from "lucide-react";
import { DocumentComposer, type DocBlock } from "@/components/document-composer";

/**
 * Generic threaded comments — works for Tasks (`/api/tickets/[id]/comments`),
 * Events, Readings, and Discussions. Endpoints share this JSON shape:
 *   { canModerate, comments: [{ id, body, parentId, author, createdAt,
 *                               editedAt, mine, attachments?, blocks? }] }
 *   POST  body = { body | blocks, parentId? }  →  { comment }
 *   PATCH body = { body | blocks }              →  { comment }
 *   DELETE                                       →  { ok: true }
 *
 * Attachments / document-style comments (interleaved text + files) are
 * OPT-IN via `enableAttachments` + `uploadUrl` — only Discussions turns them
 * on. Text-only callers are completely unaffected.
 */
type Attachment = {
  name: string;
  url: string;
  mimeType?: string;
  size?: number;
};

type C = {
  id: string;
  body: string;
  parentId: string | null;
  author: { name: string | null; image: string | null; color: string };
  createdAt: string;
  editedAt: string | null;
  mine: boolean;
  attachments?: Attachment[];
  blocks?: DocBlock[];
};

export function CommentsThread({
  apiBase,
  initialCount,
  emptyHint = "No comments yet.",
  composerPlaceholder = "Add a comment…",
  readOnly = false,
  enableAttachments = false,
  uploadUrl,
}: {
  apiBase: string;
  initialCount?: number;
  emptyHint?: string;
  composerPlaceholder?: string;
  readOnly?: boolean;
  /** Turn on the document-style composer (text + images + files). */
  enableAttachments?: boolean;
  /** Where to POST files (e.g. `/api/discussions/upload`). Required when
   *  enableAttachments is true. */
  uploadUrl?: string;
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

  const doc = enableAttachments && !!uploadUrl;

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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [apiBase]);

  // ── Text-only path (tasks / events / readings) ──
  async function send(e?: React.FormEvent) {
    e?.preventDefault();
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
    setItems((prev) => (prev ?? []).map((c) => (c.id === id ? { ...c, ...comment } : c)));
    setEditingId(null);
    setEditText("");
  }

  // ── Document path (Discussions) ──
  async function postBlocks(payload: object): Promise<C | null> {
    setSending(true);
    const r = await fetch(apiBase, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    setSending(false);
    if (!r.ok) return null;
    const { comment } = await r.json();
    return comment as C;
  }
  async function sendBlocks(blocks: DocBlock[]): Promise<boolean> {
    const comment = await postBlocks({ blocks });
    if (!comment) return false;
    setItems((prev) => [...(prev ?? []), comment]);
    return true;
  }
  async function sendReplyBlocks(parentId: string, blocks: DocBlock[]): Promise<boolean> {
    const comment = await postBlocks({ blocks, parentId });
    if (!comment) return false;
    setItems((prev) => [...(prev ?? []), comment]);
    setReplyTo(null);
    return true;
  }
  async function saveEditBlocks(id: string, blocks: DocBlock[]): Promise<boolean> {
    const r = await fetch(`${apiBase}/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ blocks }),
    });
    if (!r.ok) return false;
    const { comment } = await r.json();
    setItems((prev) => (prev ?? []).map((c) => (c.id === id ? { ...c, ...comment } : c)));
    setEditingId(null);
    return true;
  }

  async function remove(id: string) {
    if (!window.confirm("Delete this comment?")) return;
    const r = await fetch(`${apiBase}/${id}`, { method: "DELETE" });
    if (r.ok)
      setItems((prev) => (prev ?? []).filter((c) => c.id !== id && c.parentId !== id));
  }

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

  // Seed the document editor when editing: prefer stored blocks, else fold an
  // old comment's body + attachments into blocks.
  function blocksForEdit(c: C): DocBlock[] {
    if (c.blocks && c.blocks.length) return c.blocks;
    const out: DocBlock[] = [];
    if (c.body) out.push({ type: "text", text: c.body });
    for (const a of c.attachments ?? []) out.push({ type: "file", ...a });
    return out.length ? out : [{ type: "text", text: "" }];
  }

  function renderOne(c: C, isReply: boolean) {
    const editing = editingId === c.id;
    return (
      <div key={c.id} className="flex gap-2 group">
        {isReply && (
          <CornerDownRight className="mt-2 h-3.5 w-3.5 shrink-0 text-slate-300" />
        )}
        <Avatar name={c.author.name} src={c.author.image} color={c.author.color} size="xs" />
        <div className="flex-1 rounded-lg bg-slate-50 p-2 text-sm min-w-0">
          <div className="flex items-center justify-between gap-2 flex-wrap">
            <div className="text-[10px] font-semibold text-slate-500">
              {c.author.name} · {relativeTime(c.createdAt)}
              {c.editedAt && (
                <span className="ml-1 italic text-slate-400" title={`Edited ${relativeTime(c.editedAt)}`}>
                  (edited)
                </span>
              )}
            </div>
            {!editing && (
              <div className="flex gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                {!isReply && !readOnly && (
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

          {editing ? (
            doc ? (
              <div className="mt-1">
                <DocumentComposer
                  uploadUrl={uploadUrl!}
                  initial={blocksForEdit(c)}
                  submitLabel="Save"
                  sending={sending}
                  onCancel={() => setEditingId(null)}
                  onSubmit={(bl) => saveEditBlocks(c.id, bl)}
                />
              </div>
            ) : (
              <div className="mt-1 space-y-1.5">
                <Textarea rows={2} value={editText} onChange={(e) => setEditText(e.target.value)} />
                <div className="flex justify-end gap-2">
                  <Button type="button" variant="ghost" size="sm" onClick={() => { setEditingId(null); setEditText(""); }}>
                    Cancel
                  </Button>
                  <Button type="button" variant="brand" size="sm" disabled={!editText.trim()} onClick={() => saveEdit(c.id)}>
                    Save
                  </Button>
                </div>
              </div>
            )
          ) : (
            <CommentContent c={c} />
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
      <div className="space-y-2 max-h-[32rem] overflow-y-auto pr-1">
        {grouped.map(({ top, replies }) => (
          <div key={top.id} className="space-y-1.5">
            {renderOne(top, false)}
            {replies.length > 0 && (
              <div className="ml-8 space-y-1.5">
                {replies.map((r) => renderOne(r, true))}
              </div>
            )}
            {replyTo === top.id && (
              <div className="ml-8">
                {doc ? (
                  <DocumentComposer
                    uploadUrl={uploadUrl!}
                    submitLabel="Reply"
                    placeholder="Write a reply…"
                    sending={sending}
                    onCancel={() => setReplyTo(null)}
                    onSubmit={(bl) => sendReplyBlocks(top.id, bl)}
                  />
                ) : (
                  <div className="space-y-1.5">
                    <Textarea rows={2} placeholder="Write a reply…" value={replyText} onChange={(e) => setReplyText(e.target.value)} />
                    <div className="flex justify-end gap-2">
                      <Button type="button" variant="ghost" size="sm" onClick={() => { setReplyTo(null); setReplyText(""); }}>
                        Cancel
                      </Button>
                      <Button type="button" variant="brand" size="sm" disabled={sending || !replyText.trim()} onClick={() => sendReply(top.id)}>
                        {sending ? "Sending…" : "Reply"}
                      </Button>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        ))}
        {loaded && grouped.length === 0 && (
          <p className="text-xs text-slate-400 italic">{emptyHint}</p>
        )}
      </div>

      {!readOnly &&
        (doc ? (
          <div className="mt-3">
            <DocumentComposer
              uploadUrl={uploadUrl!}
              submitLabel="Send"
              placeholder={composerPlaceholder}
              sending={sending}
              onSubmit={sendBlocks}
            />
          </div>
        ) : (
          <form onSubmit={send} className={cn("mt-3 flex gap-2", grouped.length === 0 && "mt-2")}>
            <Input value={body} onChange={(e) => setBody(e.target.value)} placeholder={composerPlaceholder} />
            <Button type="submit" variant="default" size="sm" disabled={sending || !body.trim()}>
              Send
            </Button>
          </form>
        ))}
    </div>
  );
}

// ── Rendering a comment's content ──

function isImage(a: { mimeType?: string }): boolean {
  return (a.mimeType ?? "").startsWith("image/");
}

function fmtSize(bytes?: number): string {
  if (!bytes || bytes <= 0) return "";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function FileChip({ a }: { a: Attachment }) {
  return (
    <a
      href={a.url}
      target="_blank"
      rel="noopener"
      download={a.name}
      className="inline-flex items-center gap-2 rounded-md border bg-white px-2.5 py-1.5 text-xs font-medium text-slate-700 hover:text-[var(--c-violet)]"
    >
      <FileText className="h-4 w-4 text-slate-400" />
      <span className="max-w-[220px] truncate">{a.name}</span>
      {a.size ? <span className="text-[10px] text-slate-400">{fmtSize(a.size)}</span> : null}
    </a>
  );
}

function ImageThumb({ a }: { a: Attachment }) {
  return (
    <a href={a.url} target="_blank" rel="noopener">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={a.url} alt={a.name} className="max-h-56 max-w-full rounded-lg border object-contain hover:opacity-90" />
    </a>
  );
}

function CommentContent({ c }: { c: C }) {
  // Document-style comment: render blocks in the author's order.
  if (c.blocks && c.blocks.length > 0) {
    return (
      <div className="mt-0.5 space-y-2">
        {c.blocks.map((b, i) =>
          b.type === "text" ? (
            <div key={i} className="text-slate-800 whitespace-pre-wrap [overflow-wrap:anywhere]">
              {linkify(b.text)}
            </div>
          ) : isImage(b) ? (
            <ImageThumb key={i} a={b} />
          ) : (
            <div key={i}>
              <FileChip a={b} />
            </div>
          ),
        )}
      </div>
    );
  }
  // Legacy fallback: body then attachments grouped below.
  return (
    <>
      {c.body && (
        <div className="text-slate-800 whitespace-pre-wrap [overflow-wrap:anywhere]">
          {linkify(c.body)}
        </div>
      )}
      {c.attachments && c.attachments.length > 0 && (
        <div className="mt-2 space-y-1.5">
          {c.attachments.filter(isImage).length > 0 && (
            <div className="flex flex-wrap gap-2">
              {c.attachments.filter(isImage).map((a, i) => (
                <ImageThumb key={i} a={a} />
              ))}
            </div>
          )}
          {c.attachments.filter((a) => !isImage(a)).map((a, i) => (
            <div key={i}>
              <FileChip a={a} />
            </div>
          ))}
        </div>
      )}
    </>
  );
}
