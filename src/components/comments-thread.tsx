"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import { Avatar } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Input, Textarea } from "@/components/ui/input";
import { cn, relativeTime } from "@/lib/utils";
import { linkify } from "@/lib/linkify";
import { CornerDownRight, Paperclip, FileText, X, Loader2 } from "lucide-react";

/**
 * Generic threaded comments — works for both Tasks (`/api/tickets/[id]/comments`)
 * and Events (`/api/calendar/events/[id]/comments`). Both endpoints share the
 * same JSON shape:
 *   { canModerate, comments: [{ id, body, parentId, author, createdAt, editedAt, mine, attachments? }] }
 *   POST  body = { body, parentId?, attachments? }  →  { comment }
 *   PATCH body = { body }                            →  { comment }
 *   DELETE                                            →  { ok: true }
 *
 * Attachments (images + documents) are OPT-IN via `enableAttachments` +
 * `uploadUrl` — only the Discussions module turns them on. Text-only callers
 * are completely unaffected.
 *
 * One level of nesting is rendered (children are indented under their parent).
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
  /** e.g. `/api/tickets/<id>/comments` or `/api/calendar/events/<id>/comments` */
  apiBase: string;
  /** badge in the heading (renders before fetch completes) */
  initialCount?: number;
  emptyHint?: string;
  composerPlaceholder?: string;
  /** Hide the composer + Reply affordance (e.g. a closed thread). Existing
   *  comments still render; authors can still edit/delete their own. */
  readOnly?: boolean;
  /** Turn on the email-style attach button + drag-drop (Discussions only). */
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
  // Pending (uploaded, not-yet-sent) attachments for the two composers.
  const [pending, setPending] = useState<Attachment[]>([]);
  const [replyPending, setReplyPending] = useState<Attachment[]>([]);
  const [uploading, setUploading] = useState(false);

  const attach = enableAttachments && !!uploadUrl;

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

  // Upload files to the blob endpoint; append results to the given composer's
  // pending list. Silently skips any file that fails.
  async function uploadFiles(files: FileList | File[], target: "main" | "reply") {
    if (!uploadUrl) return;
    const arr = Array.from(files);
    if (arr.length === 0) return;
    setUploading(true);
    const done: Attachment[] = [];
    for (const file of arr) {
      try {
        const fd = new FormData();
        fd.append("file", file);
        const r = await fetch(uploadUrl, { method: "POST", body: fd });
        if (r.ok) {
          const j = await r.json();
          done.push({
            name: j.name,
            url: j.url,
            mimeType: j.mimeType,
            size: j.size,
          });
        }
      } catch {
        // skip this file
      }
    }
    setUploading(false);
    if (target === "main") setPending((p) => [...p, ...done]);
    else setReplyPending((p) => [...p, ...done]);
  }

  async function send(e?: React.FormEvent) {
    e?.preventDefault();
    if (!body.trim() && pending.length === 0) return;
    setSending(true);
    const r = await fetch(apiBase, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        body,
        attachments: attach ? pending : undefined,
      }),
    });
    setSending(false);
    if (!r.ok) return;
    const { comment } = await r.json();
    setItems((prev) => [...(prev ?? []), comment]);
    setBody("");
    setPending([]);
  }

  async function sendReply(parentId: string) {
    const text = replyText.trim();
    if (!text && replyPending.length === 0) return;
    setSending(true);
    const r = await fetch(apiBase, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        body: text,
        parentId,
        attachments: attach ? replyPending : undefined,
      }),
    });
    setSending(false);
    if (!r.ok) return;
    const { comment } = await r.json();
    setItems((prev) => [...(prev ?? []), comment]);
    setReplyTo(null);
    setReplyText("");
    setReplyPending([]);
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
                {!isReply && !readOnly && (
                  <button
                    type="button"
                    onClick={() => {
                      setReplyTo(c.id === replyTo ? null : c.id);
                      setReplyText("");
                      setReplyPending([]);
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
            <>
              {c.body && (
                <div className="text-slate-800 whitespace-pre-wrap [overflow-wrap:anywhere]">
                  {linkify(c.body)}
                </div>
              )}
              {c.attachments && c.attachments.length > 0 && (
                <AttachmentGrid list={c.attachments} />
              )}
            </>
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
      <div className="space-y-2 max-h-[28rem] overflow-y-auto pr-1">
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
                {attach && replyPending.length > 0 && (
                  <PendingRow
                    list={replyPending}
                    onRemove={(i) =>
                      setReplyPending((p) => p.filter((_, idx) => idx !== i))
                    }
                  />
                )}
                <div className="flex items-center justify-between gap-2">
                  {attach ? (
                    <AttachButton
                      onFiles={(f) => uploadFiles(f, "reply")}
                      uploading={uploading}
                    />
                  ) : (
                    <span />
                  )}
                  <div className="flex gap-2">
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() => {
                        setReplyTo(null);
                        setReplyText("");
                        setReplyPending([]);
                      }}
                    >
                      Cancel
                    </Button>
                    <Button
                      type="button"
                      variant="brand"
                      size="sm"
                      disabled={
                        sending ||
                        uploading ||
                        (!replyText.trim() && replyPending.length === 0)
                      }
                      onClick={() => sendReply(top.id)}
                    >
                      {sending ? "Sending…" : "Reply"}
                    </Button>
                  </div>
                </div>
              </div>
            )}
          </div>
        ))}
        {loaded && grouped.length === 0 && (
          <p className="text-xs text-slate-400 italic">{emptyHint}</p>
        )}
      </div>

      {!readOnly &&
        (attach ? (
          // Email-style composer: multiline text + attach button + drag-drop.
          <div
            className="mt-3 rounded-lg border p-2"
            onDragOver={(e) => e.preventDefault()}
            onDrop={(e) => {
              e.preventDefault();
              if (e.dataTransfer.files?.length)
                void uploadFiles(e.dataTransfer.files, "main");
            }}
          >
            {pending.length > 0 && (
              <div className="mb-2">
                <PendingRow
                  list={pending}
                  onRemove={(i) =>
                    setPending((p) => p.filter((_, idx) => idx !== i))
                  }
                />
              </div>
            )}
            <Textarea
              rows={2}
              value={body}
              onChange={(e) => setBody(e.target.value)}
              placeholder={`${composerPlaceholder} — drag files in, or attach below`}
            />
            <div className="mt-2 flex items-center justify-between gap-2">
              <AttachButton
                onFiles={(f) => uploadFiles(f, "main")}
                uploading={uploading}
              />
              <Button
                type="button"
                variant="brand"
                size="sm"
                disabled={
                  sending || uploading || (!body.trim() && pending.length === 0)
                }
                onClick={() => send()}
              >
                {sending ? "Sending…" : "Send"}
              </Button>
            </div>
          </div>
        ) : (
          <form
            onSubmit={send}
            className={cn("mt-3 flex gap-2", grouped.length === 0 && "mt-2")}
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
        ))}
    </div>
  );
}

// ── Attachment helpers ──

function isImage(a: Attachment): boolean {
  return (a.mimeType ?? "").startsWith("image/");
}

function fmtSize(bytes?: number): string {
  if (!bytes || bytes <= 0) return "";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function AttachButton({
  onFiles,
  uploading,
}: {
  onFiles: (files: FileList) => void;
  uploading: boolean;
}) {
  const ref = useRef<HTMLInputElement>(null);
  return (
    <>
      <input
        ref={ref}
        type="file"
        multiple
        className="hidden"
        onChange={(e) => {
          if (e.target.files) onFiles(e.target.files);
          e.target.value = "";
        }}
      />
      <button
        type="button"
        onClick={() => ref.current?.click()}
        disabled={uploading}
        className="inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-xs font-medium text-slate-500 hover:bg-slate-100 hover:text-slate-700 disabled:opacity-50"
      >
        {uploading ? (
          <Loader2 className="h-3.5 w-3.5 animate-spin" />
        ) : (
          <Paperclip className="h-3.5 w-3.5" />
        )}
        {uploading ? "Uploading…" : "Attach files"}
      </button>
    </>
  );
}

// Pending (removable) previews shown in the composer before send.
function PendingRow({
  list,
  onRemove,
}: {
  list: Attachment[];
  onRemove: (index: number) => void;
}) {
  return (
    <div className="flex flex-wrap gap-2">
      {list.map((a, i) => (
        <div
          key={i}
          className="relative flex items-center gap-1.5 rounded-md border bg-slate-50 px-2 py-1 text-xs"
        >
          {isImage(a) ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={a.url}
              alt={a.name}
              className="h-8 w-8 rounded object-cover"
            />
          ) : (
            <FileText className="h-4 w-4 text-slate-400" />
          )}
          <span className="max-w-[140px] truncate font-medium text-slate-700">
            {a.name}
          </span>
          <button
            type="button"
            onClick={() => onRemove(i)}
            className="ml-0.5 text-slate-400 hover:text-[var(--c-red)]"
            title="Remove"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      ))}
    </div>
  );
}

// Read-only display of a comment's attachments: images as thumbnails,
// documents as download chips.
function AttachmentGrid({ list }: { list: Attachment[] }) {
  const images = list.filter(isImage);
  const files = list.filter((a) => !isImage(a));
  return (
    <div className="mt-2 space-y-1.5">
      {images.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {images.map((a, i) => (
            <a key={i} href={a.url} target="_blank" rel="noopener">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={a.url}
                alt={a.name}
                className="max-h-56 max-w-full rounded-lg border object-contain hover:opacity-90"
              />
            </a>
          ))}
        </div>
      )}
      {files.map((a, i) => (
        <a
          key={i}
          href={a.url}
          target="_blank"
          rel="noopener"
          download={a.name}
          className="inline-flex items-center gap-2 rounded-md border bg-white px-2.5 py-1.5 text-xs font-medium text-slate-700 hover:text-[var(--c-violet)]"
        >
          <FileText className="h-4 w-4 text-slate-400" />
          <span className="max-w-[220px] truncate">{a.name}</span>
          {a.size ? (
            <span className="text-[10px] text-slate-400">{fmtSize(a.size)}</span>
          ) : null}
        </a>
      ))}
    </div>
  );
}
