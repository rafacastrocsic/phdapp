"use client";
import { useEffect, useRef, useState } from "react";
import { Paperclip, Loader2 } from "lucide-react";
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

function isImage(b: { mimeType?: string }): boolean {
  return (b.mimeType ?? "").startsWith("image/");
}

const IMG_STYLE =
  "display:block;max-width:100%;max-height:240px;border-radius:8px;margin:6px 0;border:1px solid #e2e8f0";
const CHIP_STYLE =
  "display:inline-flex;align-items:center;gap:6px;border:1px solid #e2e8f0;background:#f8fafc;border-radius:6px;padding:2px 8px;font-size:12px;font-weight:500;color:#334155";

function esc(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}
function escAttr(s: string): string {
  return esc(s).replace(/"/g, "&quot;");
}

function blocksToHtml(blocks: DocBlock[]): string {
  return blocks
    .map((b) => {
      if (b.type === "text") {
        const inner = esc(b.text).replace(/\n/g, "<br>");
        return `<div>${inner || "<br>"}</div>`;
      }
      if (isImage(b)) {
        return `<div><img src="${escAttr(b.url)}" data-url="${escAttr(b.url)}" data-name="${escAttr(b.name)}" data-mime="${escAttr(b.mimeType || "")}" data-size="${b.size ?? ""}" style="${IMG_STYLE}"/></div>`;
      }
      return `<div><span data-file="1" data-url="${escAttr(b.url)}" data-name="${escAttr(b.name)}" data-mime="${escAttr(b.mimeType || "")}" data-size="${b.size ?? ""}" contenteditable="false" style="${CHIP_STYLE}">📎 ${esc(b.name)}</span></div>`;
    })
    .join("");
}

// Build the DOM node for an uploaded file (image inline / doc chip).
function fileEl(b: DocBlock & { type: "file" }): HTMLElement {
  if (isImage(b)) {
    const img = document.createElement("img");
    img.src = b.url;
    img.dataset.url = b.url;
    img.dataset.name = b.name;
    if (b.mimeType) img.dataset.mime = b.mimeType;
    if (b.size != null) img.dataset.size = String(b.size);
    img.setAttribute("style", IMG_STYLE);
    return img;
  }
  const span = document.createElement("span");
  span.dataset.file = "1";
  span.dataset.url = b.url;
  span.dataset.name = b.name;
  if (b.mimeType) span.dataset.mime = b.mimeType;
  if (b.size != null) span.dataset.size = String(b.size);
  span.contentEditable = "false";
  span.setAttribute("style", CHIP_STYLE);
  span.textContent = `📎 ${b.name}`;
  return span;
}

const BLOCK_TAGS = new Set([
  "DIV", "P", "LI", "UL", "OL", "BLOCKQUOTE",
  "H1", "H2", "H3", "H4", "H5", "H6", "TR", "SECTION",
]);

// Walk the editor DOM in document order → ordered blocks. Text runs collapse
// into text blocks; <img>/file-chips become file blocks in place.
function serialize(root: HTMLElement): DocBlock[] {
  const blocks: DocBlock[] = [];
  let buf = "";
  const flush = () => {
    const t = buf
      .replace(/ /g, " ")
      .replace(/[ \t]+\n/g, "\n")
      .replace(/\n{3,}/g, "\n\n")
      .trim();
    if (t) blocks.push({ type: "text", text: t });
    buf = "";
  };
  const pushFile = (el: HTMLElement) => {
    flush();
    const url = el.dataset.url || (el as HTMLImageElement).src || "";
    if (!url) return;
    const size = el.dataset.size ? Number(el.dataset.size) : undefined;
    blocks.push({
      type: "file",
      name: el.dataset.name || "file",
      url,
      mimeType: el.dataset.mime || undefined,
      size: Number.isFinite(size) ? size : undefined,
    });
  };
  const walk = (node: Node) => {
    node.childNodes.forEach((child) => {
      if (child.nodeType === Node.TEXT_NODE) {
        buf += child.textContent ?? "";
      } else if (child.nodeType === Node.ELEMENT_NODE) {
        const el = child as HTMLElement;
        if (el.tagName === "IMG" || el.dataset.file === "1") {
          pushFile(el);
        } else if (el.tagName === "BR") {
          buf += "\n";
        } else {
          const block = BLOCK_TAGS.has(el.tagName);
          if (block && buf && !buf.endsWith("\n")) buf += "\n";
          walk(el);
          if (block) buf += "\n";
        }
      }
    });
  };
  walk(root);
  flush();
  return blocks;
}

function filesFromDataTransfer(dt: DataTransfer): File[] {
  const out: File[] = [];
  if (dt.files && dt.files.length) out.push(...Array.from(dt.files));
  else if (dt.items) {
    for (const it of Array.from(dt.items)) {
      if (it.kind === "file") {
        const f = it.getAsFile();
        if (f) out.push(f);
      }
    }
  }
  return out.filter((f) => f.size > 0);
}

/**
 * Email-style comment composer: a single editable surface where you type
 * freely and drop / paste / attach images and files inline, exactly where
 * the caret is — like writing an email. Content is serialised straight from
 * the DOM on send (so text is always captured).
 */
export function DocumentComposer({
  uploadUrl,
  initial,
  onSubmit,
  onCancel,
  submitLabel = "Send",
  sending = false,
  placeholder = "Write here… paste or drop images right where you want them.",
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
  const editorRef = useRef<HTMLDivElement>(null);
  const savedRange = useRef<Range | null>(null);
  const attachRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [empty, setEmpty] = useState(true);

  // Seed the editor once (edit mode) and set initial state.
  useEffect(() => {
    const el = editorRef.current;
    if (!el) return;
    if (initial && initial.length) el.innerHTML = blocksToHtml(initial);
    syncState();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function syncState() {
    const el = editorRef.current;
    if (!el) return;
    const hasFiles = !!el.querySelector("img, [data-file]");
    const hasText = (el.textContent ?? "").trim().length > 0;
    setEmpty(!hasFiles && !hasText);
  }

  function rememberSelection() {
    const sel = window.getSelection();
    const el = editorRef.current;
    if (sel && sel.rangeCount > 0 && el && el.contains(sel.anchorNode)) {
      savedRange.current = sel.getRangeAt(0).cloneRange();
    }
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

  function insertNodeAtSaved(node: HTMLElement) {
    const editor = editorRef.current;
    if (!editor) return;
    editor.focus();
    let range = savedRange.current;
    if (!range || !editor.contains(range.commonAncestorContainer)) {
      range = document.createRange();
      range.selectNodeContents(editor);
      range.collapse(false);
    }
    range.collapse(false);
    // Put each file on its own line: wrap in a div, add a trailing line.
    const wrap = document.createElement("div");
    wrap.appendChild(node);
    range.insertNode(wrap);
    const after = document.createElement("div");
    after.appendChild(document.createElement("br"));
    wrap.after(after);
    const newRange = document.createRange();
    newRange.setStart(after, 0);
    newRange.collapse(true);
    const sel = window.getSelection();
    sel?.removeAllRanges();
    sel?.addRange(newRange);
    savedRange.current = newRange.cloneRange();
  }

  async function handleFiles(files: File[]) {
    if (files.length === 0) return;
    setUploading(true);
    const uploaded = await upload(files);
    setUploading(false);
    for (const b of uploaded)
      if (b.type === "file") insertNodeAtSaved(fileEl(b));
    editorRef.current?.focus();
    syncState();
  }

  async function submit() {
    const editor = editorRef.current;
    if (!editor || sending || uploading) return;
    const blocks = serialize(editor);
    if (blocks.length === 0) {
      editor.focus();
      return;
    }
    const ok = await onSubmit(blocks);
    if (ok) {
      editor.innerHTML = "";
      savedRange.current = null;
      syncState();
    }
  }

  return (
    <div className="rounded-lg border">
      <input
        ref={attachRef}
        type="file"
        multiple
        className="hidden"
        onChange={(e) => {
          if (e.target.files) void handleFiles(Array.from(e.target.files));
          e.target.value = "";
        }}
      />

      <div className="relative">
        {empty && (
          <div className="pointer-events-none absolute left-3 top-2 text-sm text-slate-400">
            {placeholder}
          </div>
        )}
        <div
          ref={editorRef}
          contentEditable
          suppressContentEditableWarning
          role="textbox"
          aria-multiline="true"
          className="max-h-80 min-h-[4.5rem] overflow-y-auto px-3 py-2 text-sm text-slate-800 focus:outline-none [overflow-wrap:anywhere]"
          onInput={() => syncState()}
          onBlur={rememberSelection}
          onKeyUp={rememberSelection}
          onMouseUp={rememberSelection}
          onPaste={(e) => {
            const files = filesFromDataTransfer(e.clipboardData);
            if (files.length > 0) {
              e.preventDefault();
              rememberSelection();
              void handleFiles(files);
            } else {
              // Paste as plain text (strip external formatting).
              e.preventDefault();
              const text = e.clipboardData.getData("text/plain");
              document.execCommand("insertText", false, text);
              syncState();
            }
          }}
          onDragOver={(e) => e.preventDefault()}
          onDrop={(e) => {
            const files = filesFromDataTransfer(e.dataTransfer);
            if (files.length > 0) {
              e.preventDefault();
              const cd = document as Document & {
                caretRangeFromPoint?: (x: number, y: number) => Range | null;
              };
              const r = cd.caretRangeFromPoint
                ? cd.caretRangeFromPoint(e.clientX, e.clientY)
                : null;
              if (r) savedRange.current = r;
              void handleFiles(files);
            }
          }}
        />
      </div>

      <div className="flex items-center justify-between gap-2 border-t px-2 py-1.5">
        <button
          type="button"
          onMouseDown={(e) => {
            // Keep the editor selection so the file lands where the caret is.
            e.preventDefault();
            rememberSelection();
          }}
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
            disabled={sending || uploading}
            onClick={submit}
          >
            {sending ? "Sending…" : submitLabel}
          </Button>
        </div>
      </div>
    </div>
  );
}
