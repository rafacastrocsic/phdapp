"use client";
import { useState } from "react";
import { Link as LinkIcon, ExternalLink, Trash2, Pencil, Check, X, Copy } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { ExternalLink as ExtLink } from "@/lib/links";

/**
 * Generic "External links" editor for tasks and calendar events.
 *
 * The parent owns the list — it passes `initialLinks` and a `save(next)`
 * callback that PATCHes the parent entity. We keep the UI optimistic:
 * mutations apply locally first, then fire the save.
 */
export function LinksSection({
  initialLinks,
  save,
  emptyHint = "No links yet — add a paper, website, repo…",
  composerLabelPlaceholder = "Label (e.g. ‘Overleaf paper’)",
  composerUrlPlaceholder = "URL — http(s):// added automatically",
}: {
  initialLinks: ExtLink[];
  save: (next: ExtLink[]) => Promise<void> | void;
  emptyHint?: string;
  composerLabelPlaceholder?: string;
  composerUrlPlaceholder?: string;
}) {
  const [items, setItems] = useState<ExtLink[]>(initialLinks);
  const [label, setLabel] = useState("");
  const [url, setUrl] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editLabel, setEditLabel] = useState("");
  const [editUrl, setEditUrl] = useState("");
  const [busy, setBusy] = useState(false);
  // Ephemeral "Copied!" feedback per link id; clears after a beat.
  const [copiedId, setCopiedId] = useState<string | null>(null);

  async function copyUrl(l: ExtLink) {
    try {
      await navigator.clipboard.writeText(l.url);
      setCopiedId(l.id);
      setTimeout(() => {
        setCopiedId((cur) => (cur === l.id ? null : cur));
      }, 1400);
    } catch {
      // Clipboard API can be blocked (insecure context, permission); fall
      // back to a select-and-prompt so the user can still grab the URL.
      window.prompt("Copy the URL:", l.url);
    }
  }

  function makeId() {
    // Server canonicalises ids on save anyway; this is just for keys.
    return typeof crypto !== "undefined" && "randomUUID" in crypto
      ? crypto.randomUUID()
      : Math.random().toString(36).slice(2);
  }

  async function persist(next: ExtLink[]) {
    setItems(next);
    setBusy(true);
    setError(null);
    try {
      await save(next);
    } catch {
      setError("Could not save. Try again.");
    } finally {
      setBusy(false);
    }
  }

  async function add(e?: React.FormEvent) {
    e?.preventDefault();
    const lbl = label.trim();
    const u = url.trim();
    if (!lbl || !u) {
      setError("Both label and URL are required.");
      return;
    }
    const next = [...items, { id: makeId(), label: lbl, url: u }];
    setLabel("");
    setUrl("");
    await persist(next);
  }

  async function remove(id: string) {
    if (!window.confirm("Remove this link?")) return;
    await persist(items.filter((l) => l.id !== id));
  }

  function startEdit(l: ExtLink) {
    setEditingId(l.id);
    setEditLabel(l.label);
    setEditUrl(l.url);
  }

  async function saveEdit() {
    const lbl = editLabel.trim();
    const u = editUrl.trim();
    if (!lbl || !u || !editingId) {
      setEditingId(null);
      return;
    }
    const next = items.map((l) =>
      l.id === editingId ? { ...l, label: lbl, url: u } : l,
    );
    setEditingId(null);
    setEditLabel("");
    setEditUrl("");
    await persist(next);
  }

  return (
    <div>
      <div className="text-xs font-semibold uppercase text-slate-500 mb-2 flex items-center gap-1.5">
        <LinkIcon className="h-3 w-3" />
        Links {items.length > 0 && <span>({items.length})</span>}
      </div>
      <ul className="space-y-1.5">
        {items.map((l) => (
          <li
            key={l.id}
            className="group flex items-center gap-2 rounded-md border bg-slate-50 px-2.5 py-1.5 text-sm"
          >
            {editingId === l.id ? (
              <>
                <Input
                  value={editLabel}
                  onChange={(e) => setEditLabel(e.target.value)}
                  className="!h-7 !text-xs flex-1 min-w-0"
                  placeholder="Label"
                />
                <Input
                  value={editUrl}
                  onChange={(e) => setEditUrl(e.target.value)}
                  className="!h-7 !text-xs flex-1 min-w-0"
                  placeholder="URL"
                />
                <button
                  type="button"
                  onClick={saveEdit}
                  className="text-[var(--c-green)] hover:text-emerald-600"
                  title="Save"
                >
                  <Check className="h-3.5 w-3.5" />
                </button>
                <button
                  type="button"
                  onClick={() => setEditingId(null)}
                  className="text-slate-400 hover:text-slate-700"
                  title="Cancel"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              </>
            ) : (
              <>
                {/* The LABEL is the dominant clickable area. URL is no
                    longer rendered as text — it's accessed via the copy
                    icon to the right. Title attribute keeps the URL
                    discoverable on hover for power users. */}
                <a
                  href={l.url}
                  target="_blank"
                  rel="noopener"
                  className="min-w-0 flex-1 flex items-center gap-1.5 text-slate-800 hover:text-[var(--c-violet)]"
                  title={l.url}
                >
                  <ExternalLink className="h-3.5 w-3.5 shrink-0 text-slate-400" />
                  <span className="truncate font-medium">{l.label}</span>
                </a>
                <div className="flex items-center gap-2 shrink-0">
                  <button
                    type="button"
                    onClick={() => copyUrl(l)}
                    className={
                      copiedId === l.id
                        ? "text-[var(--c-green)]"
                        : "text-slate-400 hover:text-slate-700"
                    }
                    title={copiedId === l.id ? "Copied!" : "Copy URL"}
                  >
                    {copiedId === l.id ? (
                      <Check className="h-3.5 w-3.5" />
                    ) : (
                      <Copy className="h-3.5 w-3.5" />
                    )}
                  </button>
                  <button
                    type="button"
                    onClick={() => startEdit(l)}
                    className="text-slate-400 hover:text-slate-700 opacity-0 group-hover:opacity-100 transition-opacity"
                    title="Edit link"
                  >
                    <Pencil className="h-3.5 w-3.5" />
                  </button>
                  <button
                    type="button"
                    onClick={() => remove(l.id)}
                    className="text-slate-400 hover:text-[var(--c-red)] opacity-0 group-hover:opacity-100 transition-opacity"
                    title="Remove link"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              </>
            )}
          </li>
        ))}
        {items.length === 0 && (
          <li className="text-xs text-slate-400 italic">{emptyHint}</li>
        )}
      </ul>

      <form onSubmit={add} className="mt-2 flex flex-wrap items-center gap-2">
        <Input
          value={label}
          onChange={(e) => setLabel(e.target.value)}
          placeholder={composerLabelPlaceholder}
          className="flex-1 min-w-[140px]"
        />
        <Input
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          placeholder={composerUrlPlaceholder}
          className="flex-1 min-w-[160px]"
        />
        <Button
          type="submit"
          size="sm"
          variant="default"
          disabled={busy || !label.trim() || !url.trim()}
        >
          Add link
        </Button>
      </form>
      {error && (
        <div className="mt-1.5 text-xs text-[var(--c-red)]">{error}</div>
      )}
    </div>
  );
}
