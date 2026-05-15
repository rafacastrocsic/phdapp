"use client";
import { useEffect, useState } from "react";
import {
  Folder,
  FileText,
  ChevronRight,
  ChevronLeft,
  Check,
  Search,
  ExternalLink,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";

const FOLDER_MIME = "application/vnd.google-apps.folder";
const SHORTCUT_MIME = "application/vnd.google-apps.shortcut";

interface DriveNode {
  id: string;
  name: string;
}
interface RawFile {
  id: string;
  name: string;
  mimeType?: string;
  webViewLink?: string;
  shortcutDetails?: { targetId?: string; targetMimeType?: string };
}
interface Item {
  id: string;
  name: string;
  isFolder: boolean;
  url: string;
}

/**
 * Pick EITHER a folder or a file from THE STUDENT'S shared Drive folder
 * (rooted at `rootFolderId` — the student's supervision folder, not the
 * viewer's own Drive). Returns a Drive URL string via onChange — a folder
 * URL for folders, the file's webViewLink for files.
 */
export function DriveItemPicker({
  rootFolderId,
  value,
  onChange,
  triggerLabel = "Pick from Drive",
}: {
  rootFolderId: string | null;
  value: string | null;
  onChange: (url: string | null) => void;
  triggerLabel?: string;
}) {
  const [open, setOpen] = useState(false);
  const [path, setPath] = useState<DriveNode[]>([
    { id: rootFolderId ?? "root", name: "Student's Drive" },
  ]);
  const [items, setItems] = useState<Item[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");

  const current = path[path.length - 1]!;

  // Reset to the student's root whenever the dialog opens.
  useEffect(() => {
    if (open && rootFolderId)
      setPath([{ id: rootFolderId, name: "Student's Drive" }]);
  }, [open, rootFolderId]);

  useEffect(() => {
    if (!open || !rootFolderId) return;
    let cancelled = false;
    (async () => {
      setLoading(true);
      setError(null);
      const params = new URLSearchParams({ folderId: current.id });
      // NOTE: no foldersOnly → list files AND folders.
      const r = await fetch(`/api/drive/list?${params.toString()}`);
      if (cancelled) return;
      setLoading(false);
      if (!r.ok) {
        const j = await r.json().catch(() => ({}));
        setError(j.error ?? "Could not load Drive");
        setItems([]);
        return;
      }
      const j = await r.json();
      setItems(
        (j.files ?? []).map((f: RawFile): Item => {
          const isShortcut = f.mimeType === SHORTCUT_MIME;
          const targetMime = f.shortcutDetails?.targetMimeType;
          const isFolder =
            f.mimeType === FOLDER_MIME ||
            (isShortcut && targetMime === FOLDER_MIME);
          const realId =
            isShortcut && f.shortcutDetails?.targetId
              ? f.shortcutDetails.targetId
              : f.id;
          return {
            id: realId,
            name: f.name,
            isFolder,
            url: isFolder
              ? `https://drive.google.com/drive/folders/${realId}`
              : f.webViewLink ??
                `https://drive.google.com/file/d/${realId}/view`,
          };
        }),
      );
    })();
    return () => {
      cancelled = true;
    };
  }, [current, open, rootFolderId]);

  function pickCurrentFolder() {
    onChange(`https://drive.google.com/drive/folders/${current.id}`);
    setOpen(false);
  }

  const filtered = items.filter((f) =>
    f.name.toLowerCase().includes(search.toLowerCase()),
  );

  return (
    <div className="flex flex-wrap items-center gap-2">
      <div className="flex-1 min-w-0">
        {value ? (
          <a
            href={value}
            target="_blank"
            rel="noopener"
            className="flex items-center gap-2 rounded-lg border bg-slate-50 px-3 py-1.5 text-xs hover:bg-slate-100"
          >
            <ExternalLink className="h-3.5 w-3.5 text-[var(--c-blue)] shrink-0" />
            <span className="truncate font-medium text-slate-700">
              {value.replace(/^https?:\/\//, "")}
            </span>
          </a>
        ) : (
          <span className="text-xs text-slate-400 italic">
            No Drive item linked
          </span>
        )}
      </div>
      {rootFolderId ? (
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => setOpen(true)}
        >
          <Folder className="h-3.5 w-3.5" /> {triggerLabel}
        </Button>
      ) : (
        <span className="text-[11px] text-slate-400 italic">
          Student has no shared Drive folder yet
        </span>
      )}
      {value && (
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={() => onChange(null)}
        >
          Clear
        </Button>
      )}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="!max-w-2xl">
          <DialogHeader>
            <DialogTitle>Pick a Drive file or folder</DialogTitle>
          </DialogHeader>

          <div className="flex items-center gap-2 text-sm flex-wrap mb-3">
            {path.length > 1 && (
              <button
                onClick={() => setPath((p) => p.slice(0, -1))}
                className="rounded p-1 hover:bg-slate-100"
                aria-label="Back"
              >
                <ChevronLeft className="h-4 w-4" />
              </button>
            )}
            {path.map((p, i) => (
              <span key={`${p.id}-${i}`} className="flex items-center gap-1 min-w-0">
                {i > 0 && <ChevronRight className="h-3 w-3 text-slate-400 shrink-0" />}
                <button
                  onClick={() => setPath((pp) => pp.slice(0, i + 1))}
                  className={cn(
                    "text-slate-700 hover:text-[var(--c-blue)] truncate max-w-[160px]",
                    i === path.length - 1 && "font-semibold",
                  )}
                >
                  {p.name}
                </button>
              </span>
            ))}
          </div>

          <div className="relative mb-3">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400" />
            <Input
              placeholder="Filter this view…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="!pl-9 !h-9"
            />
          </div>

          <div className="rounded-lg border bg-white max-h-72 overflow-y-auto">
            {error ? (
              <div className="p-4 text-sm text-[var(--c-red)] bg-red-50">{error}</div>
            ) : loading ? (
              <div className="p-4 space-y-2">
                {Array.from({ length: 4 }).map((_, i) => (
                  <div key={i} className="h-9 rounded shimmer" />
                ))}
              </div>
            ) : filtered.length === 0 ? (
              <div className="p-8 text-center text-sm text-slate-500">
                Nothing here.
              </div>
            ) : (
              <ul>
                {filtered.map((f) => (
                  <li key={f.id}>
                    <button
                      onClick={() => {
                        if (f.isFolder) {
                          setPath((p) => [...p, { id: f.id, name: f.name }]);
                        } else {
                          onChange(f.url);
                          setOpen(false);
                        }
                      }}
                      className="flex w-full items-center gap-3 px-3 py-2 text-sm hover:bg-slate-50 text-left"
                    >
                      <span
                        className={cn(
                          "flex h-7 w-7 items-center justify-center rounded-md shrink-0",
                          f.isFolder
                            ? "bg-blue-50 text-[var(--c-blue)]"
                            : "bg-slate-100 text-slate-500",
                        )}
                      >
                        {f.isFolder ? (
                          <Folder className="h-4 w-4" />
                        ) : (
                          <FileText className="h-4 w-4" />
                        )}
                      </span>
                      <span className="flex-1 truncate font-medium text-slate-800">
                        {f.name}
                      </span>
                      {f.isFolder ? (
                        <ChevronRight className="h-4 w-4 text-slate-300" />
                      ) : (
                        <Check className="h-4 w-4 text-slate-300" />
                      )}
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <p className="text-[11px] text-slate-500 mt-2">
            Click a <strong>folder</strong> to open it, a <strong>file</strong> to
            pick it. Or use <strong>Select this folder</strong> to pick the folder
            you&apos;re currently in.
          </p>

          <div className="flex justify-between gap-2 pt-3 border-t mt-3">
            <Button type="button" variant="ghost" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button
              type="button"
              variant="brand"
              onClick={pickCurrentFolder}
              disabled={!rootFolderId}
            >
              <Check className="h-4 w-4" /> Select this folder
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

