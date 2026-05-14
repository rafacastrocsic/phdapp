"use client";
import { useEffect, useState } from "react";
import {
  Folder,
  FileText,
  Image as ImageIcon,
  FileSpreadsheet,
  FileCode2,
  File,
  ExternalLink,
  ChevronRight,
  RefreshCw,
  Home,
  Star,
  LayoutGrid,
  List as ListIcon,
  PanelLeftClose,
  PanelLeftOpen,
} from "lucide-react";
import Link from "next/link";
import { Avatar } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { cn, displayName } from "@/lib/utils";
import { DriveShareButton } from "../students/[id]/drive-share-button";

interface Student {
  id: string;
  fullName: string;
  alias: string | null;
  color: string;
  driveFolderId: string | null;
}
interface DriveFile {
  id: string;
  name: string;
  mimeType: string;
  webViewLink?: string;
  iconLink?: string;
  modifiedTime?: string;
  size?: string | null;
  shortcutDetails?: {
    targetId?: string;
    targetMimeType?: string;
  };
}

const FOLDER_MIME = "application/vnd.google-apps.folder";

function isFolderLike(f: DriveFile): boolean {
  if (f.mimeType === FOLDER_MIME) return true;
  if (
    f.mimeType === "application/vnd.google-apps.shortcut" &&
    f.shortcutDetails?.targetMimeType === FOLDER_MIME
  )
    return true;
  return false;
}

function targetFolderId(f: DriveFile): string {
  return f.shortcutDetails?.targetId ?? f.id;
}

export function FilesBrowser({
  students,
  initialStudentId,
  viewerStudentId,
}: {
  students: Student[];
  initialStudentId: string | null;
  initialFolderId: string | null;
  viewerStudentId?: string | null;
}) {
  const studentsWithDrive = students.filter((s) => s.driveFolderId);
  const [selectedStudent, setSelectedStudent] = useState<Student | null>(
    students.find((s) => s.id === initialStudentId) ?? studentsWithDrive[0] ?? null,
  );
  const [path, setPath] = useState<{ id: string; name: string }[]>([]);
  const [files, setFiles] = useState<DriveFile[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [favorites, setFavorites] = useState<Set<string>>(new Set());
  const [view, setView] = useState<"icons" | "list">("icons");
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);

  useEffect(() => {
    const saved = localStorage.getItem("phdapp.files.view");
    if (saved === "icons" || saved === "list") setView(saved);
    const sb = localStorage.getItem("phdapp.files.sidebar");
    if (sb === "collapsed") setSidebarCollapsed(true);
  }, []);
  useEffect(() => {
    localStorage.setItem("phdapp.files.view", view);
  }, [view]);
  useEffect(() => {
    localStorage.setItem(
      "phdapp.files.sidebar",
      sidebarCollapsed ? "collapsed" : "expanded",
    );
  }, [sidebarCollapsed]);

  const currentFolderId =
    path[path.length - 1]?.id ?? selectedStudent?.driveFolderId ?? null;

  useEffect(() => {
    if (!selectedStudent?.driveFolderId) {
      setFiles([]);
      setFavorites(new Set());
      return;
    }
    setPath([]);
    // Load favorites for this student
    (async () => {
      const r = await fetch(`/api/students/${selectedStudent.id}/favorites`);
      if (!r.ok) {
        setFavorites(new Set());
        return;
      }
      const j = await r.json();
      type FavRow = { driveFileId: string };
      setFavorites(new Set(j.favorites.map((f: FavRow) => f.driveFileId)));
    })();
  }, [selectedStudent]);

  async function toggleFavorite(file: DriveFile) {
    if (!selectedStudent) return;
    const isStarred = favorites.has(file.id);
    // optimistic
    setFavorites((prev) => {
      const next = new Set(prev);
      if (isStarred) next.delete(file.id);
      else next.add(file.id);
      return next;
    });
    if (isStarred) {
      const r = await fetch(
        `/api/students/${selectedStudent.id}/favorites/${file.id}`,
        { method: "DELETE" },
      );
      if (!r.ok) {
        // revert
        setFavorites((prev) => new Set(prev).add(file.id));
        const j = await r.json().catch(() => ({}));
        alert(j.error ?? "Could not unstar");
      }
    } else {
      const r = await fetch(`/api/students/${selectedStudent.id}/favorites`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          driveFileId: file.id,
          name: file.name,
          mimeType: file.mimeType,
          webViewLink: file.webViewLink,
          iconLink: file.iconLink,
          parentFolderId: currentFolderId,
        }),
      });
      if (!r.ok) {
        setFavorites((prev) => {
          const next = new Set(prev);
          next.delete(file.id);
          return next;
        });
        const j = await r.json().catch(() => ({}));
        alert(j.error ?? "Could not star");
      }
    }
  }

  useEffect(() => {
    if (!currentFolderId) return;
    let cancelled = false;
    (async () => {
      setLoading(true);
      setError(null);
      const r = await fetch(
        `/api/drive/list?folderId=${encodeURIComponent(currentFolderId)}`,
      );
      if (cancelled) return;
      setLoading(false);
      if (!r.ok) {
        const j = await r.json().catch(() => ({}));
        setError(j.error ?? "Could not list files");
        setFiles([]);
        return;
      }
      const j = await r.json();
      setFiles(j.files ?? []);
    })();
    return () => {
      cancelled = true;
    };
  }, [currentFolderId]);

  function openFolder(f: DriveFile) {
    setPath((p) => [...p, { id: targetFolderId(f), name: f.name }]);
  }
  function jumpTo(idx: number) {
    setPath((p) => p.slice(0, idx + 1));
  }

  const isStudentViewer = viewerStudentId != null;

  return (
    <div className="flex h-[calc(100vh-4rem)] overflow-hidden">
      {!isStudentViewer && (
        <aside
          className={cn(
            "shrink-0 border-r bg-white overflow-y-auto transition-[width] duration-200",
            sidebarCollapsed ? "w-12 p-2" : "w-72 p-3",
          )}
        >
          <div
            className={cn(
              "flex items-center mb-2",
              sidebarCollapsed ? "justify-center" : "justify-between px-2",
            )}
          >
            {!sidebarCollapsed && (
              <h2 className="text-xs font-semibold uppercase text-slate-500">
                Students
              </h2>
            )}
            <button
              type="button"
              onClick={() => setSidebarCollapsed((v) => !v)}
              title={sidebarCollapsed ? "Expand students" : "Collapse students"}
              aria-label={sidebarCollapsed ? "Expand students" : "Collapse students"}
              className="rounded-md p-1 text-slate-400 hover:text-slate-700 hover:bg-slate-100"
            >
              {sidebarCollapsed ? (
                <PanelLeftOpen className="h-4 w-4" />
              ) : (
                <PanelLeftClose className="h-4 w-4" />
              )}
            </button>
          </div>
          {students.length === 0 ? (
            !sidebarCollapsed && (
              <p className="text-xs text-slate-500 p-2">No students.</p>
            )
          ) : (
            <ul className={cn(sidebarCollapsed ? "space-y-1" : "space-y-0.5")}>
              {students.map((s) => (
                <li key={s.id}>
                  <button
                    onClick={() => setSelectedStudent(s)}
                    title={sidebarCollapsed ? displayName(s) : undefined}
                    className={cn(
                      "w-full rounded-lg hover:bg-slate-50",
                      selectedStudent?.id === s.id && "bg-slate-100",
                      sidebarCollapsed
                        ? "flex justify-center p-1.5"
                        : "flex items-center gap-2 px-2 py-2 text-sm text-left",
                    )}
                  >
                    <Avatar name={displayName(s)} color={s.color} size="sm" />
                    {!sidebarCollapsed && (
                      <div className="flex-1 min-w-0">
                        <div className="font-medium text-slate-900 truncate">
                          {displayName(s)}
                        </div>
                        <div className="text-[10px] text-slate-500 truncate">
                          {s.driveFolderId ? "Drive linked" : "no Drive folder"}
                        </div>
                      </div>
                    )}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </aside>
      )}

      <main className="flex-1 overflow-y-auto bg-slate-50">
        <div className="px-6 lg:px-8 py-4 border-b bg-white flex items-center justify-between gap-4 flex-wrap">
          <div className="flex items-center gap-1 text-sm flex-wrap">
            {selectedStudent ? (
              <>
                <button
                  onClick={() => setPath([])}
                  className="flex items-center gap-2 font-semibold text-slate-700 hover:text-[var(--c-blue)]"
                >
                  <Home className="h-4 w-4" />
                  {displayName(selectedStudent)}&apos;s Drive
                </button>
                {path.map((p, i) => (
                  <span key={p.id} className="flex items-center gap-1">
                    <ChevronRight className="h-3 w-3 text-slate-400" />
                    <button
                      onClick={() => jumpTo(i)}
                      className="text-slate-700 hover:text-[var(--c-blue)] truncate max-w-[180px]"
                    >
                      {p.name}
                    </button>
                  </span>
                ))}
              </>
            ) : (
              <span className="text-slate-500">Select a student</span>
            )}
          </div>
          <div className="flex items-center gap-2">
            <div
              role="group"
              aria-label="View mode"
              className="inline-flex rounded-lg border bg-white p-0.5"
            >
              <button
                type="button"
                onClick={() => setView("icons")}
                title="Icons view"
                aria-pressed={view === "icons"}
                className={cn(
                  "flex items-center gap-1.5 rounded-md px-2.5 py-1 text-xs font-semibold transition-colors",
                  view === "icons"
                    ? "bg-slate-900 text-white"
                    : "text-slate-600 hover:bg-slate-100",
                )}
              >
                <LayoutGrid className="h-3.5 w-3.5" />
                Icons
              </button>
              <button
                type="button"
                onClick={() => setView("list")}
                title="List view"
                aria-pressed={view === "list"}
                className={cn(
                  "flex items-center gap-1.5 rounded-md px-2.5 py-1 text-xs font-semibold transition-colors",
                  view === "list"
                    ? "bg-slate-900 text-white"
                    : "text-slate-600 hover:bg-slate-100",
                )}
              >
                <ListIcon className="h-3.5 w-3.5" />
                List
              </button>
            </div>
            {selectedStudent?.driveFolderId && (
              <a
                href={`https://drive.google.com/drive/folders/${currentFolderId ?? selectedStudent.driveFolderId}`}
                target="_blank"
                rel="noopener"
              >
                <Button variant="outline" size="sm">
                  <ExternalLink className="h-4 w-4" /> Open in Drive
                </Button>
              </a>
            )}
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setPath((p) => [...p])}
              title="Refresh"
            >
              <RefreshCw className={cn("h-4 w-4", loading && "animate-spin")} />
            </Button>
          </div>
        </div>

        <div className="p-6">
          {!selectedStudent ? (
            <EmptyHint
              title="Pick a student"
              text="Use the list on the left to start browsing."
            />
          ) : !selectedStudent.driveFolderId ? (
            selectedStudent.id === viewerStudentId ? (
              <div className="rounded-2xl border border-dashed bg-white p-12 text-center">
                <div className="text-base font-semibold text-slate-700">
                  No Drive folder linked yet
                </div>
                <p className="text-sm text-slate-500 mt-1 max-w-md mx-auto">
                  PhDapp can create a shared Drive folder in your Google account
                  and grant your supervisors writer access automatically.
                </p>
                <div className="mt-4 inline-block">
                  <DriveShareButton
                    studentId={selectedStudent.id}
                    hasFolder={false}
                  />
                </div>
              </div>
            ) : (
              <EmptyHint
                title="No Drive folder linked"
                text={
                  <>
                    Ask{" "}
                    <Link
                      href={`/students/${selectedStudent.id}`}
                      className="text-[var(--c-blue)] hover:underline"
                    >
                      {displayName(selectedStudent)}
                    </Link>{" "}
                    to create a shared Drive folder from their profile.
                  </>
                }
              />
            )
          ) : error ? (
            <div className="rounded-2xl border border-amber-200 bg-amber-50 p-6 text-sm text-amber-900">
              <strong>{error}</strong>
              <p className="mt-2 text-amber-800">
                If you just signed in, try signing out and in again to grant Drive permissions.
                Make sure the OAuth scope <code>drive</code> is enabled and the
                folder is shared with your Google account.
              </p>
            </div>
          ) : files.length === 0 && !loading ? (
            <EmptyHint title="Empty folder" text="No files here yet." />
          ) : view === "icons" ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
              {loading
                ? Array.from({ length: 8 }).map((_, i) => (
                    <div
                      key={i}
                      className="rounded-xl bg-white border h-20 shimmer"
                    />
                  ))
                : sortFiles(files).map((f) => (
                    <FileCard
                      key={f.id}
                      file={f}
                      starred={favorites.has(f.id)}
                      onOpen={() => openFolder(f)}
                      onToggleStar={() => toggleFavorite(f)}
                    />
                  ))}
            </div>
          ) : (
            <div className="rounded-xl bg-white border overflow-hidden">
              <div className="grid grid-cols-[minmax(0,1fr)_140px_120px_40px] items-center gap-3 px-4 py-2 border-b bg-slate-50 text-[10px] font-semibold uppercase tracking-wide text-slate-500">
                <span>Name</span>
                <span>Type</span>
                <span>Modified</span>
                <span className="sr-only">Actions</span>
              </div>
              {loading ? (
                <div className="divide-y">
                  {Array.from({ length: 8 }).map((_, i) => (
                    <div key={i} className="h-11 shimmer" />
                  ))}
                </div>
              ) : (
                <ul className="divide-y">
                  {sortFiles(files).map((f) => (
                    <FileRow
                      key={f.id}
                      file={f}
                      starred={favorites.has(f.id)}
                      onOpen={() => openFolder(f)}
                      onToggleStar={() => toggleFavorite(f)}
                    />
                  ))}
                </ul>
              )}
            </div>
          )}
        </div>
      </main>
    </div>
  );
}

function FileCard({
  file,
  starred,
  onOpen,
  onToggleStar,
}: {
  file: DriveFile;
  starred: boolean;
  onOpen: () => void;
  onToggleStar: () => void;
}) {
  const isFolder = isFolderLike(file);
  const effectiveMime = isFolder ? FOLDER_MIME : file.mimeType;
  const Icon = iconFor(effectiveMime);
  const accent = colorFor(effectiveMime);

  const star = (
    <button
      type="button"
      onClick={(e) => {
        e.stopPropagation();
        e.preventDefault();
        onToggleStar();
      }}
      title={starred ? "Remove from main documents" : "Add to main documents"}
      className={cn(
        "shrink-0 rounded-md p-1.5 transition-colors",
        starred
          ? "text-amber-500 hover:bg-amber-50"
          : "text-slate-300 hover:text-amber-500 hover:bg-amber-50",
      )}
    >
      <Star
        className="h-4 w-4"
        fill={starred ? "currentColor" : "none"}
        strokeWidth={2}
      />
    </button>
  );

  if (isFolder) {
    return (
      <div className="relative rounded-xl bg-white border hover:shadow-md hover:-translate-y-0.5 transition-all flex items-center">
        <button
          onClick={onOpen}
          className="flex-1 text-left p-4 flex items-center gap-3 min-w-0"
        >
          <span
            className="flex h-10 w-10 items-center justify-center rounded-xl shrink-0"
            style={{ background: `${accent}1f`, color: accent }}
          >
            <Folder className="h-5 w-5" />
          </span>
          <div className="flex-1 min-w-0">
            <div className="text-sm font-semibold text-slate-900 truncate">
              {file.name}
            </div>
            <div className="text-xs text-slate-500">Folder</div>
          </div>
        </button>
        <div className="pr-3">{star}</div>
      </div>
    );
  }

  return (
    <div className="relative rounded-xl bg-white border hover:shadow-md hover:-translate-y-0.5 transition-all flex items-center">
      <a
        href={file.webViewLink ?? "#"}
        target="_blank"
        rel="noopener"
        className="flex-1 p-4 flex items-center gap-3 min-w-0"
      >
        <span
          className="flex h-10 w-10 items-center justify-center rounded-xl shrink-0"
          style={{ background: `${accent}1f`, color: accent }}
        >
          <Icon className="h-5 w-5" />
        </span>
        <div className="flex-1 min-w-0">
          <div className="text-sm font-medium text-slate-900 truncate">
            {file.name}
          </div>
          <div className="text-xs text-slate-500 truncate">
            {prettyMime(file.mimeType)}
            {file.modifiedTime && (
              <> · {new Date(file.modifiedTime).toLocaleDateString()}</>
            )}
          </div>
        </div>
        <ExternalLink className="h-3.5 w-3.5 text-slate-400 shrink-0" />
      </a>
      <div className="pr-3">{star}</div>
    </div>
  );
}

function sortFiles(files: DriveFile[]): DriveFile[] {
  return [...files].sort((a, b) => {
    const af = isFolderLike(a);
    const bf = isFolderLike(b);
    if (af && !bf) return -1;
    if (!af && bf) return 1;
    return a.name.localeCompare(b.name);
  });
}

function FileRow({
  file,
  starred,
  onOpen,
  onToggleStar,
}: {
  file: DriveFile;
  starred: boolean;
  onOpen: () => void;
  onToggleStar: () => void;
}) {
  const isFolder = isFolderLike(file);
  const effectiveMime = isFolder ? FOLDER_MIME : file.mimeType;
  const Icon = isFolder ? Folder : iconFor(effectiveMime);
  const accent = colorFor(effectiveMime);
  const typeLabel = isFolder ? "Folder" : prettyMime(file.mimeType);
  const modified = file.modifiedTime
    ? new Date(file.modifiedTime).toLocaleDateString()
    : "";

  const star = (
    <button
      type="button"
      onClick={(e) => {
        e.stopPropagation();
        e.preventDefault();
        onToggleStar();
      }}
      title={starred ? "Remove from main documents" : "Add to main documents"}
      className={cn(
        "shrink-0 rounded-md p-1.5 transition-colors",
        starred
          ? "text-amber-500 hover:bg-amber-50"
          : "text-slate-300 hover:text-amber-500 hover:bg-amber-50",
      )}
    >
      <Star
        className="h-4 w-4"
        fill={starred ? "currentColor" : "none"}
        strokeWidth={2}
      />
    </button>
  );

  const nameCell = (
    <div className="flex items-center gap-3 min-w-0">
      <span
        className="flex h-8 w-8 items-center justify-center rounded-lg shrink-0"
        style={{ background: `${accent}1f`, color: accent }}
      >
        <Icon className="h-4 w-4" />
      </span>
      <span className="truncate text-sm font-medium text-slate-900">
        {file.name}
      </span>
      {!isFolder && (
        <ExternalLink className="h-3 w-3 text-slate-300 shrink-0" />
      )}
    </div>
  );

  return (
    <li className="grid grid-cols-[minmax(0,1fr)_140px_120px_40px] items-center gap-3 px-4 py-2 hover:bg-slate-50">
      {isFolder ? (
        <button
          type="button"
          onClick={onOpen}
          className="text-left min-w-0 cursor-pointer"
        >
          {nameCell}
        </button>
      ) : (
        <a
          href={file.webViewLink ?? "#"}
          target="_blank"
          rel="noopener"
          className="min-w-0"
        >
          {nameCell}
        </a>
      )}
      <span className="text-xs text-slate-500 truncate">{typeLabel}</span>
      <span className="text-xs text-slate-500 truncate">{modified}</span>
      <div className="flex justify-end">{star}</div>
    </li>
  );
}

function EmptyHint({ title, text }: { title: string; text: React.ReactNode }) {
  return (
    <div className="rounded-2xl border border-dashed bg-white p-12 text-center">
      <div className="text-base font-semibold text-slate-700">{title}</div>
      <div className="text-sm text-slate-500 mt-1">{text}</div>
    </div>
  );
}

function iconFor(mime: string) {
  if (mime.startsWith("image/")) return ImageIcon;
  if (mime.includes("spreadsheet") || mime.includes("excel")) return FileSpreadsheet;
  if (mime.includes("document") || mime.includes("pdf")) return FileText;
  if (mime.includes("javascript") || mime.includes("json") || mime.includes("script")) return FileCode2;
  return File;
}

function colorFor(mime: string) {
  if (mime === "application/vnd.google-apps.folder") return "#2196f3";
  if (mime.startsWith("image/")) return "#ec4899";
  if (mime.includes("spreadsheet") || mime.includes("excel")) return "#00ca72";
  if (mime.includes("document")) return "#6f4cff";
  if (mime.includes("pdf")) return "#e2445c";
  if (mime.includes("presentation")) return "#ff7a45";
  return "#64748b";
}

function prettyMime(mime: string) {
  const m: Record<string, string> = {
    "application/vnd.google-apps.document": "Google Doc",
    "application/vnd.google-apps.spreadsheet": "Google Sheet",
    "application/vnd.google-apps.presentation": "Google Slides",
    "application/pdf": "PDF",
  };
  return m[mime] ?? mime.split("/").pop() ?? mime;
}
