"use client";
import { useEffect, useState } from "react";
import {
  Folder,
  Home,
  ChevronRight,
  ChevronLeft,
  Check,
  Search,
  Users,
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

interface DriveFolder {
  id: string;
  name: string;
}

export function DriveFolderPicker({
  value,
  onChange,
  triggerLabel = "Pick from Drive",
}: {
  value: string | null;
  onChange: (folderId: string | null, folderName: string | null) => void;
  triggerLabel?: string;
}) {
  const [open, setOpen] = useState(false);
  const [path, setPath] = useState<DriveFolder[]>([{ id: "root", name: "My Drive" }]);
  const [folders, setFolders] = useState<DriveFolder[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [mode, setMode] = useState<"my" | "shared">("my");
  const [pickedName, setPickedName] = useState<string | null>(null);

  const current = path[path.length - 1];

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    (async () => {
      setLoading(true);
      setError(null);
      const params = new URLSearchParams();
      if (mode === "shared" && path.length === 1) {
        params.set("sharedWithMe", "1");
      } else {
        params.set("folderId", current.id);
      }
      params.set("foldersOnly", "1");
      const r = await fetch(`/api/drive/list?${params.toString()}`);
      if (cancelled) return;
      setLoading(false);
      if (!r.ok) {
        const j = await r.json().catch(() => ({}));
        setError(j.error ?? "Could not load folders");
        setFolders([]);
        return;
      }
      const j = await r.json();
      type Raw = {
        id: string;
        name: string;
        mimeType?: string;
        shortcutDetails?: { targetId?: string; targetMimeType?: string };
      };
      setFolders(
        (j.files ?? []).map((f: Raw) => ({
          // If it's a folder-shortcut, navigate into the target folder
          id:
            f.mimeType === "application/vnd.google-apps.shortcut" &&
            f.shortcutDetails?.targetMimeType === "application/vnd.google-apps.folder"
              ? f.shortcutDetails.targetId ?? f.id
              : f.id,
          name: f.name,
        })),
      );
    })();
    return () => {
      cancelled = true;
    };
  }, [current, mode, open, path.length]);

  function enter(f: DriveFolder) {
    setPath((p) => [...p, f]);
  }
  function jumpTo(idx: number) {
    setPath((p) => p.slice(0, idx + 1));
  }
  function reset(newMode: "my" | "shared") {
    setMode(newMode);
    setPath([
      newMode === "my"
        ? { id: "root", name: "My Drive" }
        : { id: "shared", name: "Shared with me" },
    ]);
  }
  function pickCurrent() {
    if (path.length <= 1) return; // can't pick the root or shared list itself
    onChange(current.id, current.name);
    setPickedName(current.name);
    setOpen(false);
  }
  function clear() {
    onChange(null, null);
    setPickedName(null);
  }

  const filtered = folders.filter((f) =>
    f.name.toLowerCase().includes(search.toLowerCase()),
  );

  return (
    <div className="flex flex-wrap items-center gap-2">
      <div className="flex-1 min-w-0">
        {value ? (
          <div className="flex items-center gap-2 rounded-lg border bg-slate-50 px-3 py-1.5 text-sm">
            <Folder className="h-3.5 w-3.5 text-[var(--c-blue)] shrink-0" />
            <span className="truncate font-medium text-slate-700">
              {pickedName ?? value}
            </span>
            <a
              href={`https://drive.google.com/drive/folders/${value}`}
              target="_blank"
              rel="noopener"
              className="text-xs text-[var(--c-blue)] hover:underline ml-auto"
            >
              open
            </a>
          </div>
        ) : (
          <span className="text-xs text-slate-500 italic">No folder linked</span>
        )}
      </div>
      <Button type="button" variant="outline" size="sm" onClick={() => setOpen(true)}>
        <Folder className="h-4 w-4" /> {triggerLabel}
      </Button>
      {value && (
        <Button type="button" variant="ghost" size="sm" onClick={clear}>
          Clear
        </Button>
      )}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="!max-w-2xl">
          <DialogHeader>
            <DialogTitle>Pick a Google Drive folder</DialogTitle>
          </DialogHeader>

          <div className="flex gap-1 border-b mb-3">
            <TabButton
              active={mode === "my"}
              onClick={() => reset("my")}
              icon={<Home className="h-3.5 w-3.5" />}
            >
              My Drive
            </TabButton>
            <TabButton
              active={mode === "shared"}
              onClick={() => reset("shared")}
              icon={<Users className="h-3.5 w-3.5" />}
            >
              Shared with me
            </TabButton>
          </div>

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
                  onClick={() => jumpTo(i)}
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
              placeholder="Filter folders in this view…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="!pl-9 !h-9"
            />
          </div>

          <div className="rounded-lg border bg-white max-h-72 overflow-y-auto">
            {error ? (
              <div className="p-4 text-sm text-[var(--c-red)] bg-red-50">
                {error}
              </div>
            ) : loading ? (
              <div className="p-4 space-y-2">
                {Array.from({ length: 4 }).map((_, i) => (
                  <div key={i} className="h-9 rounded shimmer" />
                ))}
              </div>
            ) : filtered.length === 0 ? (
              <div className="p-8 text-center text-sm text-slate-500">
                No folders here.
              </div>
            ) : (
              <ul>
                {filtered.map((f) => (
                  <li key={f.id}>
                    <button
                      onDoubleClick={() => {
                        onChange(f.id, f.name);
                        setPickedName(f.name);
                        setOpen(false);
                      }}
                      onClick={() => enter(f)}
                      className="flex w-full items-center gap-3 px-3 py-2 text-sm hover:bg-slate-50 text-left"
                    >
                      <span className="flex h-7 w-7 items-center justify-center rounded-md bg-blue-50 text-[var(--c-blue)] shrink-0">
                        <Folder className="h-4 w-4" />
                      </span>
                      <span className="flex-1 truncate font-medium text-slate-800">
                        {f.name}
                      </span>
                      <ChevronRight className="h-4 w-4 text-slate-300" />
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <p className="text-[11px] text-slate-500 mt-2">
            Tip: single-click to open, double-click to pick. Or click{" "}
            <strong>Select this folder</strong> below to pick the one you&apos;re currently in.
          </p>

          <div className="flex justify-between gap-2 pt-3 border-t mt-3">
            <Button
              type="button"
              variant="ghost"
              onClick={() => setOpen(false)}
            >
              Cancel
            </Button>
            <Button
              type="button"
              variant="brand"
              onClick={pickCurrent}
              disabled={path.length <= 1}
            >
              <Check className="h-4 w-4" /> Select this folder
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function TabButton({
  active,
  onClick,
  icon,
  children,
}: {
  active: boolean;
  onClick: () => void;
  icon: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium border-b-2 -mb-px",
        active
          ? "border-[var(--c-blue)] text-[var(--c-blue)]"
          : "border-transparent text-slate-500 hover:text-slate-900",
      )}
    >
      {icon}
      {children}
    </button>
  );
}
