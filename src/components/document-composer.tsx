"use client";
import { useRef, useState } from "react";
import {
  Paperclip,
  FileText,
  X,
  Loader2,
  ArrowUp,
  ArrowDown,
  Plus,
} from "lucide-react";
import { Button } from "@/components/ui/button";

// A single content block of a document-style comment.
export type DocBlock =
  | { type: "text"; text: string }
  | {
      type: "file";
      name: string;
      url: string;
      mimeType?: string;
      size?: number;
    };

type EditorBlock = DocBlock & { _id: string };

function newId(): string {
  return typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : Math.random().toString(36).slice(2);
}

function withIds(blocks: DocBlock[]): EditorBlock[] {
  return blocks.map((b) => ({ ...b, _id: newId() }));
}

// Strip the editor-only _id back to a wire DocBlock.
function toDocBlock(b: EditorBlock): DocBlock {
  return b.type === "text"
    ? { type: "text", text: b.text }
    : { type: "file", name: b.name, url: b.url, mimeType: b.mimeType, size: b.size };
}

function isImage(b: { mimeType?: string }): boolean {
  return (b.mimeType ?? "").startsWith("image/");
}

/**
 * Email/document-style comment composer: an ordered stack of blocks that
 * interleaves editable text and uploaded files (images inline, documents as
 * chips) in the author's order. Attach / paste / drop inserts a file where
 * you are; each block can be reordered or removed. The last block is always
 * a text block, so there's always a line to keep typing on below.
 */
export function DocumentComposer({
  uploadUrl,
  initial,
  onSubmit,
  onCancel,
  submitLabel = "Send",
  sending = false,
  placeholder = "Write here… attach or paste images anywhere.",
}: {
  uploadUrl: string;
  initial?: DocBlock[];
  /** Return true on success to reset the composer (create); false/void keeps state. */
  onSubmit: (blocks: DocBlock[]) => Promise<boolean | void> | boolean | void;
  onCancel?: () => void;
  submitLabel?: string;
  sending?: boolean;
  placeholder?: string;
}) {
  const [blocks, setBlocks] = useState<EditorBlock[]>(
    initial && initial.length ? withIds(initial) : [{ type: "text", text: "", _id: newId() }],
  );
  const [uploading, setUploading] = useState(false);
  // Which block index last had focus — so Attach/paste inserts right there.
  const focusedIndex = useRef<number>(0);

  function normalize(list: EditorBlock[]): EditorBlock[] {
    // Guarantee at least one block and a trailing text block to type on.
    let next = list.length ? list : [{ type: "text", text: "", _id: newId() } as EditorBlock];
    const last = next[next.length - 1];
    if (last.type !== "text")
      next = [...next, { type: "text", text: "", _id: newId() }];
    return next;
  }

  async function upload(files: File[]): Promise<DocBlock[]> {
    const done: DocBlock[] = [];
    for (const file of files) {
      try {
        const fd = new FormData();
        fd.append("file", file);
        const r = await fetch(uploadUrl, { method: "POST", body: fd });
        if (r.ok) {
          const j = await r.json();
          done.push({
            type: "file",
            name: j.name,
            url: j.url,
            mimeType: j.mimeType,
            size: j.size,
          });
        }
      } catch {
        // skip failed file
      }
    }
    return done;
  }

  async function insertFilesAfter(index: number, files: FileList | File[]) {
    const arr = Array.from(files);
    if (arr.length === 0) return;
    setUploading(true);
    const uploaded = await upload(arr);
    setUploading(false);
    if (uploaded.length === 0) return;
    setBlocks((prev) => {
      const next = [...prev];
      const at = Math.min(Math.max(index + 1, 0), next.length);
      next.splice(at, 0, ...uploaded.map((b) => ({ ...b, _id: newId() })));
      return normalize(next);
    });
  }

  function setText(id: string, text: string) {
    setBlocks((prev) => prev.map((b) => (b._id === id && b.type === "text" ? { ...b, text } : b)));
  }
  function removeBlock(id: string) {
    setBlocks((prev) => normalize(prev.filter((b) => b._id !== id)));
  }
  function move(index: number, dir: -1 | 1) {
    setBlocks((prev) => {
      const j = index + dir;
      if (j < 0 || j >= prev.length) return prev;
      const next = [...prev];
      [next[index], next[j]] = [next[j], next[index]];
      return next;
    });
  }
  function addTextBlock() {
    setBlocks((prev) => [...prev, { type: "text", text: "", _id: newId() }]);
  }

  const attachRef = useRef<HTMLInputElement>(null);

  const hasContent = blocks.some(
    (b) => (b.type === "text" && b.text.trim()) || b.type === "file",
  );

  async function submit() {
    if (!hasContent || sending || uploading) return;
    const payload: DocBlock[] = blocks.map(toDocBlock);
    const ok = await onSubmit(payload);
    if (ok) setBlocks([{ type: "text", text: "", _id: newId() }]);
  }

  return (
    <div
      className="rounded-lg border p-2"
      onDragOver={(e) => e.preventDefault()}
      onDrop={(e) => {
        e.preventDefault();
        if (e.dataTransfer.files?.length)
          void insertFilesAfter(blocks.length - 1, e.dataTransfer.files);
      }}
    >
      <input
        ref={attachRef}
        type="file"
        multiple
        className="hidden"
        onChange={(e) => {
          if (e.target.files)
            void insertFilesAfter(focusedIndex.current, e.target.files);
          e.target.value = "";
        }}
      />

      <div className="space-y-1.5">
        {blocks.map((b, i) => (
          <div key={b._id} className="group/blk flex items-start gap-1.5">
            <div className="min-w-0 flex-1">
              {b.type === "text" ? (
                <textarea
                  rows={2}
                  value={b.text}
                  placeholder={i === 0 ? placeholder : "Write…"}
                  onFocus={() => (focusedIndex.current = i)}
                  onInput={(e) => {
                    const t = e.currentTarget;
                    t.style.height = "auto";
                    t.style.height = `${t.scrollHeight}px`;
                  }}
                  onPaste={(e) => {
                    const files = Array.from(e.clipboardData.files);
                    if (files.length > 0) {
                      e.preventDefault();
                      void insertFilesAfter(i, files);
                    }
                  }}
                  onChange={(e) => setText(b._id, e.target.value)}
                  className="w-full resize-none rounded-md border-0 bg-transparent px-1 py-1 text-sm text-slate-800 placeholder:text-slate-400 focus:outline-none [overflow-wrap:anywhere]"
                />
              ) : isImage(b) ? (
                <a href={b.url} target="_blank" rel="noopener" className="block">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={b.url}
                    alt={b.name}
                    className="max-h-52 max-w-full rounded-lg border object-contain"
                  />
                </a>
              ) : (
                <div className="inline-flex items-center gap-2 rounded-md border bg-slate-50 px-2.5 py-1.5 text-xs font-medium text-slate-700">
                  <FileText className="h-4 w-4 text-slate-400" />
                  <span className="max-w-[220px] truncate">{b.name}</span>
                </div>
              )}
            </div>
            {/* Per-block controls (reorder / remove) — files always; text on hover. */}
            <div
              className={
                "flex shrink-0 flex-col items-center gap-0.5 pt-1 transition-opacity " +
                (b.type === "file"
                  ? "opacity-60 group-hover/blk:opacity-100"
                  : "opacity-0 group-hover/blk:opacity-100")
              }
            >
              <button
                type="button"
                title="Move up"
                disabled={i === 0}
                onClick={() => move(i, -1)}
                className="text-slate-400 hover:text-slate-700 disabled:opacity-30"
              >
                <ArrowUp className="h-3.5 w-3.5" />
              </button>
              <button
                type="button"
                title="Move down"
                disabled={i === blocks.length - 1}
                onClick={() => move(i, 1)}
                className="text-slate-400 hover:text-slate-700 disabled:opacity-30"
              >
                <ArrowDown className="h-3.5 w-3.5" />
              </button>
              {/* Don't allow removing the sole trailing text block. */}
              {!(b.type === "text" && blocks.length === 1) && (
                <button
                  type="button"
                  title="Remove"
                  onClick={() => removeBlock(b._id)}
                  className="text-slate-400 hover:text-[var(--c-red)]"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              )}
            </div>
          </div>
        ))}
      </div>

      <div className="mt-2 flex items-center justify-between gap-2 border-t pt-2">
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={() => attachRef.current?.click()}
            disabled={uploading}
            className="inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-xs font-medium text-slate-500 hover:bg-slate-100 hover:text-slate-700 disabled:opacity-50"
          >
            {uploading ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <Paperclip className="h-3.5 w-3.5" />
            )}
            {uploading ? "Uploading…" : "Attach image / file"}
          </button>
          <button
            type="button"
            onClick={addTextBlock}
            className="inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-xs font-medium text-slate-500 hover:bg-slate-100 hover:text-slate-700"
          >
            <Plus className="h-3.5 w-3.5" /> Text
          </button>
        </div>
        <div className="flex items-center gap-2">
          {onCancel && (
            <Button type="button" variant="ghost" size="sm" onClick={onCancel}>
              Cancel
            </Button>
          )}
          <Button
            type="button"
            variant="brand"
            size="sm"
            disabled={!hasContent || sending || uploading}
            onClick={submit}
          >
            {sending ? "Sending…" : submitLabel}
          </Button>
        </div>
      </div>
    </div>
  );
}
