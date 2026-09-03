"use client";
import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  Plus,
  Pin,
  PinOff,
  Pencil,
  Trash2,
  GraduationCap,
  KanbanSquare,
  CalendarDays,
  FolderOpen,
  ExternalLink as ExternalLinkIcon,
  Briefcase,
  ArrowUpDown,
  ArrowUp,
  ArrowDown,
  Filter,
  List,
  Columns3,
  CheckSquare,
  X as XIcon,
} from "lucide-react";
import { Avatar } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Input, Textarea, Select } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { LinksSection } from "@/components/links-section";
import { DriveFolderPicker } from "@/components/drive-folder-picker";
import { CommentsThread } from "@/components/comments-thread";
import { MessageSquare } from "lucide-react";
import { format } from "date-fns";
import { linkify } from "@/lib/linkify";
import { cn } from "@/lib/utils";
import { statusColor } from "@/lib/kanban-constants";
import type { ExternalLink } from "@/lib/links";

const DRIVE_FOLDER_URL_RE = /\/folders\/([a-zA-Z0-9_-]+)/;

type Ref = { id: string; title: string; status?: string };
export type ChecklistItem = { id: string; text: string; done: boolean };
export type Involvement = {
  id: string;
  title: string;
  notes: string | null;
  progress: number;
  checklist: ChecklistItem[];
  status: "active" | "paused" | "done";
  priority: "high" | "medium" | "low";
  shared: boolean;
  allowComments: boolean;
  commentCount: number;
  pinned: boolean;
  links: ExternalLink[];
  driveFolderUrl: string | null;
  student: { id: string; name: string; color: string } | null;
  task: Ref | null;
  event: { id: string; title: string; startsAt: string } | null;
  owner: { id: string; name: string | null; color: string } | null;
  createdAt: string;
  updatedAt: string;
};

type StudentOpt = { id: string; name: string; color: string };
type TaskOpt = { id: string; title: string; status: string; studentName: string };
type EventOpt = { id: string; title: string; startsAt: string };
type DriveRoot = { id: string; name: string; kind: "student" | "team" };

function newRowId(): string {
  return typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : Math.random().toString(36).slice(2);
}
function clCount(list: ChecklistItem[]): { done: number; total: number } {
  return { done: list.filter((c) => c.done).length, total: list.length };
}

type SortKey =
  | "updated"
  | "created"
  | "priority"
  | "progress"
  | "author"
  | "title";

const SORT_OPTIONS: { key: SortKey; label: string }[] = [
  { key: "updated", label: "Recently updated" },
  { key: "created", label: "Recently created" },
  { key: "priority", label: "Priority (high first)" },
  { key: "progress", label: "Progress (high → low)" },
  { key: "author", label: "Author (A–Z)" },
  { key: "title", label: "Title (A–Z)" },
];

const PRIORITY_RANK: Record<string, number> = { high: 3, medium: 2, low: 1 };

function compareBy(a: Involvement, b: Involvement, key: SortKey): number {
  switch (key) {
    case "created":
      return b.createdAt.localeCompare(a.createdAt);
    case "priority":
      return (
        (PRIORITY_RANK[b.priority] ?? 0) - (PRIORITY_RANK[a.priority] ?? 0) ||
        b.updatedAt.localeCompare(a.updatedAt)
      );
    case "progress":
      return b.progress - a.progress || b.updatedAt.localeCompare(a.updatedAt);
    case "author":
      return (
        (a.owner?.name ?? "").localeCompare(b.owner?.name ?? "") ||
        b.updatedAt.localeCompare(a.updatedAt)
      );
    case "title":
      return a.title.localeCompare(b.title);
    case "updated":
    default:
      return b.updatedAt.localeCompare(a.updatedAt);
  }
}

// Sort a list. Your own pinned items float to the top regardless of the
// chosen key (others' pins don't float in your list); within each group the
// key applies. `owner` is set only on other people's shared items.
function sortItems(list: Involvement[], key: SortKey): Involvement[] {
  return [...list].sort((a, b) => {
    const ap = a.pinned && !a.owner;
    const bp = b.pinned && !b.owner;
    if (ap !== bp) return ap ? -1 : 1;
    return compareBy(a, b, key);
  });
}

const STATUS_META: Record<string, { label: string; chip: string; bar: string }> = {
  active: { label: "Active", chip: "bg-violet-50 text-[var(--c-violet)]", bar: "var(--c-violet)" },
  paused: { label: "Paused", chip: "bg-amber-50 text-amber-600", bar: "#f59e0b" },
  done: { label: "Done", chip: "bg-emerald-50 text-emerald-600", bar: "var(--c-green)" },
};

const PRIORITY_META: Record<
  string,
  { label: string; chip: string; accent: string }
> = {
  high: { label: "High", chip: "bg-red-50 text-[var(--c-red)]", accent: "var(--c-red)" },
  medium: { label: "Medium", chip: "bg-amber-50 text-amber-600", accent: "#f59e0b" },
  low: { label: "Low", chip: "bg-slate-100 text-slate-500", accent: "#cbd5e1" },
};

export function MyWorkView({
  mine,
  shared,
  students,
  tasks,
  events,
  driveRoots,
}: {
  mine: Involvement[];
  shared: Involvement[];
  students: StudentOpt[];
  tasks: TaskOpt[];
  events: EventOpt[];
  driveRoots: DriveRoot[];
}) {
  const [editing, setEditing] = useState<Involvement | null>(null);
  const [creating, setCreating] = useState(false);
  const [sort, setSort] = useState<SortKey>("updated");
  const [authorFilter, setAuthorFilter] = useState<string>(""); // "" | "mine" | ownerId
  const [priorityFilter, setPriorityFilter] = useState<string>(""); // "" | high | medium | low
  const [viewMode, setViewMode] = useState<"list" | "board">("list");
  // Compact-card click opens the full item in a read-only preview overlay.
  const [preview, setPreview] = useState<Involvement | null>(null);

  // Author options from the data: "Mine" (own items) + each distinct owner
  // of a shared item.
  const authorOptions = useMemo(() => {
    const owners = new Map<string, string>();
    for (const i of shared)
      if (i.owner) owners.set(i.owner.id, i.owner.name ?? "Teammate");
    return { hasMine: mine.length > 0, owners: [...owners.entries()] };
  }, [mine, shared]);

  // One flat list: my items + the team's shared items, sorted together, then
  // filtered by author / priority. Ownership shown per-card (owner name on
  // others'; a 👥 on shared).
  const allItems = useMemo(
    () => sortItems([...mine, ...shared], sort),
    [mine, shared, sort],
  );
  const items = useMemo(
    () =>
      allItems.filter((i) => {
        if (priorityFilter && i.priority !== priorityFilter) return false;
        if (authorFilter === "mine" && i.owner) return false;
        if (authorFilter && authorFilter !== "mine" && i.owner?.id !== authorFilter)
          return false;
        return true;
      }),
    [allItems, authorFilter, priorityFilter],
  );
  const filtersActive = !!authorFilter || !!priorityFilter;

  return (
    <div
      className={cn(
        "mx-auto w-full p-4 md:p-6",
        // The board fills the window; the list stays a readable column.
        viewMode === "board" ? "max-w-none" : "max-w-4xl",
      )}
    >
      <div className="mb-5 flex items-start justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-xl font-bold text-slate-900">
            <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-teal-50 text-[var(--c-teal)]">
              <Briefcase className="h-4 w-4" />
            </span>
            My Work
          </h1>
          <p className="mt-1 text-sm text-slate-500">
            Your personal list of what you&apos;re involved in — with progress,
            links, documents, and references to students, tasks or events.
            Private unless you share an item with the team.
          </p>
        </div>
        <Button variant="brand" className="shrink-0" onClick={() => setCreating(true)}>
          <Plus className="h-4 w-4" /> New item
        </Button>
      </div>

      {/* Filter + sort controls */}
      <div className="mb-4 flex flex-wrap items-center gap-2">
        {/* View: list vs. per-author board */}
        <div className="flex items-center rounded-lg border bg-white p-0.5">
          <button
            type="button"
            onClick={() => setViewMode("list")}
            className={cn(
              "inline-flex items-center gap-1 rounded-md px-2.5 py-1 text-xs font-medium transition",
              viewMode === "list"
                ? "bg-slate-100 text-slate-900"
                : "text-slate-500 hover:text-slate-700",
            )}
            title="List view"
          >
            <List className="h-3.5 w-3.5" /> List
          </button>
          <button
            type="button"
            onClick={() => setViewMode("board")}
            className={cn(
              "inline-flex items-center gap-1 rounded-md px-2.5 py-1 text-xs font-medium transition",
              viewMode === "board"
                ? "bg-slate-100 text-slate-900"
                : "text-slate-500 hover:text-slate-700",
            )}
            title="Board grouped by author"
          >
            <Columns3 className="h-3.5 w-3.5" /> By author
          </button>
        </div>
        <div className="flex items-center gap-1.5 rounded-lg border bg-white pl-2.5">
          <Filter className="h-3.5 w-3.5 text-slate-400" />
          <span className="text-xs text-slate-500">Author</span>
          <Select
            value={authorFilter}
            onChange={(e) => setAuthorFilter(e.target.value)}
            className="!h-9 !w-auto !border-0 !bg-transparent !pl-1 pr-2 text-sm font-medium focus:!ring-0"
            title="Filter by author"
          >
            <option value="">All authors</option>
            {authorOptions.hasMine && <option value="mine">Mine</option>}
            {authorOptions.owners.map(([id, name]) => (
              <option key={id} value={id}>
                {name}
              </option>
            ))}
          </Select>
        </div>
        <div className="flex items-center gap-1.5 rounded-lg border bg-white pl-2.5">
          <span className="text-xs text-slate-500">Priority</span>
          <Select
            value={priorityFilter}
            onChange={(e) => setPriorityFilter(e.target.value)}
            className="!h-9 !w-auto !border-0 !bg-transparent !pl-1 pr-2 text-sm font-medium focus:!ring-0"
            title="Filter by priority"
          >
            <option value="">All priorities</option>
            <option value="high">High</option>
            <option value="medium">Medium</option>
            <option value="low">Low</option>
          </Select>
        </div>
        {filtersActive && (
          <button
            type="button"
            onClick={() => {
              setAuthorFilter("");
              setPriorityFilter("");
            }}
            className="text-xs font-medium text-slate-400 hover:text-slate-700"
          >
            Clear
          </button>
        )}
        <div className="ml-auto flex items-center gap-1.5 rounded-lg border bg-white pl-2.5">
          <ArrowUpDown className="h-3.5 w-3.5 text-slate-400" />
          <span className="text-xs text-slate-500">Sort by</span>
          <Select
            value={sort}
            onChange={(e) => setSort(e.target.value as SortKey)}
            className="!h-9 !w-auto !border-0 !bg-transparent !pl-1 pr-2 text-sm font-medium focus:!ring-0"
            title="Sort items"
          >
            {SORT_OPTIONS.map((o) => (
              <option key={o.key} value={o.key}>
                {o.label}
              </option>
            ))}
          </Select>
        </div>
      </div>

      {allItems.length === 0 ? (
        <div className="rounded-xl border border-dashed bg-slate-50 p-10 text-center">
          <Briefcase className="mx-auto h-8 w-8 text-slate-300" />
          <p className="mt-3 text-sm font-medium text-slate-600">
            Nothing here yet.
          </p>
          <p className="mt-1 text-xs text-slate-400">
            Add the projects, service, and responsibilities you&apos;re juggling.
          </p>
          <Button variant="outline" size="sm" className="mt-4" onClick={() => setCreating(true)}>
            <Plus className="h-4 w-4" /> New item
          </Button>
        </div>
      ) : items.length === 0 ? (
        <div className="rounded-xl border border-dashed bg-slate-50 p-8 text-center">
          <p className="text-sm text-slate-500">
            No items match these filters.
          </p>
          <button
            type="button"
            onClick={() => {
              setAuthorFilter("");
              setPriorityFilter("");
            }}
            className="mt-2 text-xs font-medium text-[var(--c-teal)] hover:underline"
          >
            Clear filters
          </button>
        </div>
      ) : viewMode === "board" ? (
        <MyWorkBoard items={items} onOpen={setPreview} />
      ) : (
        <ul className="space-y-3">
          {items.map((i) => (
            <li key={i.id}>
              <InvolvementCard
                item={i}
                readOnly={!!i.owner}
                onEdit={i.owner ? undefined : () => setEditing(i)}
              />
            </li>
          ))}
        </ul>
      )}

      {/* Board card → full read-only preview (own items get an Edit button). */}
      {preview && (
        <div
          className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-slate-900/40 p-4 backdrop-blur-sm print:hidden"
          onClick={() => setPreview(null)}
        >
          <div
            className="mt-6 w-full max-w-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mb-2 flex justify-end">
              <button
                type="button"
                onClick={() => setPreview(null)}
                className="inline-flex items-center gap-1 rounded-lg bg-white/90 px-2.5 py-1 text-xs font-medium text-slate-600 shadow hover:bg-white"
              >
                <XIcon className="h-3.5 w-3.5" /> Close
              </button>
            </div>
            <InvolvementCard
              item={preview}
              readOnly={!!preview.owner}
              onEdit={
                preview.owner
                  ? undefined
                  : () => {
                      setEditing(preview);
                      setPreview(null);
                    }
              }
            />
          </div>
        </div>
      )}

      {(creating || editing) && (
        <InvolvementDialog
          item={editing}
          students={students}
          tasks={tasks}
          events={events}
          driveRoots={driveRoots}
          onClose={() => {
            setCreating(false);
            setEditing(null);
          }}
        />
      )}
    </div>
  );
}

// Board grouped by author: one column per person (You first, then each
// teammate who has shared items), each column priority-ordered.
function MyWorkBoard({
  items,
  onOpen,
}: {
  items: Involvement[];
  onOpen: (i: Involvement) => void;
}) {
  const columns = useMemo(() => {
    // Pinned first, then priority (high→low), then most-recently updated.
    const rank = (i: Involvement) =>
      (i.pinned ? 1000 : 0) + (PRIORITY_RANK[i.priority] ?? 0);
    const cmp = (a: Involvement, b: Involvement) =>
      rank(b) - rank(a) || b.updatedAt.localeCompare(a.updatedAt);

    const mine: Involvement[] = [];
    const byOwner = new Map<
      string,
      { id: string; name: string; color: string; items: Involvement[] }
    >();
    for (const i of items) {
      if (!i.owner) {
        mine.push(i);
      } else {
        let c = byOwner.get(i.owner.id);
        if (!c) {
          c = {
            id: i.owner.id,
            name: i.owner.name ?? "Teammate",
            color: i.owner.color,
            items: [],
          };
          byOwner.set(i.owner.id, c);
        }
        c.items.push(i);
      }
    }

    const cols: {
      key: string;
      name: string;
      color: string;
      mine: boolean;
      items: Involvement[];
    }[] = [];
    if (mine.length)
      cols.push({
        key: "__mine__",
        name: "You",
        color: "var(--c-teal)",
        mine: true,
        items: [...mine].sort(cmp),
      });
    for (const c of [...byOwner.values()].sort((a, b) =>
      a.name.localeCompare(b.name),
    ))
      cols.push({
        key: c.id,
        name: c.name,
        color: c.color,
        mine: false,
        items: [...c.items].sort(cmp),
      });
    return cols;
  }, [items]);

  return (
    <div className="flex gap-4 overflow-x-auto pb-3">
      {columns.map((col) => (
        <div key={col.key} className="flex-1 min-w-72">
          <div className="mb-2 flex items-center gap-2 px-1">
            {col.mine ? (
              <span
                className="flex h-6 w-6 items-center justify-center rounded-full text-white"
                style={{ background: col.color }}
              >
                <Briefcase className="h-3 w-3" />
              </span>
            ) : (
              <Avatar name={col.name} src={null} color={col.color} size="xs" />
            )}
            <span className="truncate text-sm font-semibold text-slate-800">
              {col.name}
            </span>
            <span className="ml-auto shrink-0 rounded-full bg-slate-100 px-1.5 text-[10px] font-semibold text-slate-500">
              {col.items.length}
            </span>
          </div>
          <div className="space-y-2">
            {col.items.map((i) => (
              <CompactCard key={i.id} i={i} onOpen={onOpen} />
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

function CompactCard({
  i,
  onOpen,
}: {
  i: Involvement;
  onOpen: (i: Involvement) => void;
}) {
  const pm = PRIORITY_META[i.priority] ?? PRIORITY_META.medium;
  const sm = STATUS_META[i.status] ?? STATUS_META.active;
  const done = i.checklist.filter((c) => c.done).length;
  const total = i.checklist.length;
  return (
    <button
      type="button"
      onClick={() => onOpen(i)}
      className="block w-full rounded-xl border bg-white p-3 text-left shadow-sm transition hover:shadow-md"
      style={{ borderLeftWidth: 3, borderLeftColor: pm.accent }}
    >
      <div className="flex items-start justify-between gap-2">
        <span className="line-clamp-2 text-sm font-semibold leading-snug text-slate-900">
          {i.title}
        </span>
        <span className="flex shrink-0 items-center gap-1 pt-0.5">
          {i.pinned && !i.owner && <Pin className="h-3 w-3 text-slate-400" />}
          {i.shared && !i.owner && <span title="Shared with the team">👥</span>}
        </span>
      </div>
      <div className="mt-2 flex flex-wrap items-center gap-1.5">
        <span
          className={cn(
            "rounded-full px-1.5 py-0.5 text-[10px] font-semibold",
            pm.chip,
          )}
        >
          {pm.label}
        </span>
        {i.status !== "active" && (
          <span
            className={cn(
              "rounded-full px-1.5 py-0.5 text-[10px] font-semibold",
              sm.chip,
            )}
          >
            {sm.label}
          </span>
        )}
        {total > 0 && (
          <span className="inline-flex items-center gap-0.5 text-[10px] text-slate-500">
            <CheckSquare className="h-3 w-3" />
            {done}/{total}
          </span>
        )}
        {i.commentCount > 0 && (
          <span className="inline-flex items-center gap-0.5 text-[10px] text-slate-500">
            <MessageSquare className="h-3 w-3" />
            {i.commentCount}
          </span>
        )}
      </div>
      <div className="mt-2 flex items-center gap-2">
        <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-slate-100">
          <div
            className="h-full rounded-full"
            style={{ width: `${i.progress}%`, background: sm.bar }}
          />
        </div>
        <span className="text-[10px] font-medium text-slate-400">
          {i.progress}%
        </span>
      </div>
    </button>
  );
}

function InvolvementCard({
  item,
  onEdit,
  readOnly = false,
}: {
  item: Involvement;
  onEdit?: () => void;
  readOnly?: boolean;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  // Comments start unfolded when a note is shown; the toggle can hide them.
  const [showComments, setShowComments] = useState(true);
  const sm = STATUS_META[item.status] ?? STATUS_META.active;
  const pm = PRIORITY_META[item.priority] ?? PRIORITY_META.medium;

  async function patch(payload: Record<string, unknown>) {
    setBusy(true);
    await fetch(`/api/involvements/${item.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    setBusy(false);
    router.refresh();
  }
  async function remove() {
    if (!window.confirm("Delete this item?")) return;
    setBusy(true);
    const r = await fetch(`/api/involvements/${item.id}`, { method: "DELETE" });
    if (r.ok) router.refresh();
    else setBusy(false);
  }

  return (
    <div
      className={cn(
        "rounded-xl border border-l-4 bg-white p-4",
        item.pinned && !readOnly && "border-teal-200 bg-teal-50/30",
        item.status === "done" && "opacity-75",
      )}
      style={{ borderLeftColor: pm.accent }}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
            {item.pinned && !readOnly && (
              <Pin className="h-3.5 w-3.5 shrink-0 text-[var(--c-teal)]" />
            )}
            <span className="font-semibold text-slate-900 [overflow-wrap:anywhere]">
              {item.title}
            </span>
            <span className={cn("rounded-full px-2 py-0.5 text-[10px] font-semibold", pm.chip)}>
              {pm.label}
            </span>
            <span className={cn("rounded-full px-2 py-0.5 text-[10px] font-semibold", sm.chip)}>
              {sm.label}
            </span>
            {item.shared && (
              <span
                title="Shared with the senior team"
                className="text-sm leading-none"
              >
                👥
              </span>
            )}
            {readOnly && item.owner && (
              <span className="inline-flex items-center gap-1 text-[11px] text-slate-400">
                <Avatar name={item.owner.name} src={null} color={item.owner.color} size="xs" />
                {item.owner.name}
              </span>
            )}
          </div>
          <div className="mt-0.5 text-[11px] text-slate-400">
            Created {format(new Date(item.createdAt), "d MMM yyyy")}
            {Math.abs(
              +new Date(item.updatedAt) - +new Date(item.createdAt),
            ) > 2000 && (
              <>
                {" · Updated "}
                <span title={format(new Date(item.updatedAt), "d MMM yyyy, HH:mm")}>
                  {format(new Date(item.updatedAt), "d MMM yyyy")}
                </span>
              </>
            )}
          </div>
        </div>
        {!readOnly && (
          <div className="flex shrink-0 items-center gap-0.5">
            <IconBtn
              title={item.pinned ? "Unpin" : "Pin"}
              onClick={() => patch({ pinned: !item.pinned })}
              disabled={busy}
            >
              {item.pinned ? <PinOff className="h-4 w-4" /> : <Pin className="h-4 w-4" />}
            </IconBtn>
            <IconBtn title="Edit" onClick={onEdit} disabled={busy}>
              <Pencil className="h-4 w-4" />
            </IconBtn>
            <IconBtn title="Delete" danger onClick={remove} disabled={busy}>
              <Trash2 className="h-4 w-4" />
            </IconBtn>
          </div>
        )}
      </div>

      {/* Progress */}
      <div className="mt-2.5 flex items-center gap-2">
        <div className="h-2 flex-1 overflow-hidden rounded-full bg-slate-100">
          <div
            className="h-full rounded-full transition-all"
            style={{ width: `${item.progress}%`, background: sm.bar }}
          />
        </div>
        <span className="shrink-0 text-right text-xs font-semibold text-slate-500 tabular-nums">
          {item.checklist.length > 0 && (
            <span className="mr-1 font-normal text-slate-400">
              {clCount(item.checklist).done}/{clCount(item.checklist).total}
            </span>
          )}
          {item.progress}%
        </span>
      </div>

      {item.notes && (
        <p className="mt-2 whitespace-pre-wrap text-sm text-slate-600 [overflow-wrap:anywhere]">
          {linkify(item.notes)}
        </p>
      )}

      {/* Checklist — tick items to move the % (own items only). Shown
          below the note so the write-up reads first, then the steps. */}
      {item.checklist.length > 0 && (
        <ul className="mt-2 space-y-0.5">
          {item.checklist.map((c) => (
            <li key={c.id} className="flex items-start gap-2 text-sm">
              <input
                type="checkbox"
                checked={c.done}
                disabled={readOnly || busy}
                onChange={() => {
                  const next = item.checklist.map((x) =>
                    x.id === c.id ? { ...x, done: !x.done } : x,
                  );
                  void patch({ checklist: next });
                }}
                className="mt-0.5 h-3.5 w-3.5 shrink-0 accent-[var(--c-teal)] disabled:opacity-50"
              />
              <span
                className={cn(
                  "[overflow-wrap:anywhere]",
                  c.done ? "text-slate-400 line-through" : "text-slate-700",
                )}
              >
                {c.text}
              </span>
            </li>
          ))}
        </ul>
      )}

      {/* Reference chips + links + drive */}
      {(item.student ||
        item.task ||
        item.event ||
        item.links.length > 0 ||
        item.driveFolderUrl) && (
        <div className="mt-2.5 flex flex-wrap items-center gap-1.5">
          {item.student && (
            <Chip href={`/students/${item.student.id}`}>
              <span
                className="inline-block h-2 w-2 rounded-full"
                style={{ background: item.student.color }}
              />
              <GraduationCap className="h-3 w-3" /> {item.student.name}
            </Chip>
          )}
          {item.task && (
            <Chip href={`/kanban?ticket=${item.task.id}`}>
              <span
                className="inline-block h-2 w-2 rounded-full"
                style={{ background: statusColor(item.task.status ?? "") }}
              />
              <KanbanSquare className="h-3 w-3" /> {item.task.title}
            </Chip>
          )}
          {item.event && (
            <Chip href="/calendar">
              <CalendarDays className="h-3 w-3" /> {item.event.title}
            </Chip>
          )}
          {item.links.map((l) => (
            <Chip key={l.id} href={l.url} external>
              <ExternalLinkIcon className="h-3 w-3" /> {l.label}
            </Chip>
          ))}
          {item.driveFolderUrl && (
            <Chip href={item.driveFolderUrl} external>
              <FolderOpen className="h-3 w-3 text-[var(--c-blue)]" /> Drive
            </Chip>
          )}
        </div>
      )}

      {/* Comments — only on shared items with comments enabled (or existing). */}
      {item.shared && (item.allowComments || item.commentCount > 0) && (
        <div className="mt-3 border-t pt-2">
          <button
            type="button"
            onClick={() => setShowComments((v) => !v)}
            className="inline-flex items-center gap-1.5 text-xs font-semibold text-slate-500 hover:text-slate-800"
          >
            <MessageSquare className="h-3.5 w-3.5" />
            {showComments ? "Hide comments" : `Comments (${item.commentCount})`}
          </button>
          {showComments && (
            <div className="mt-2">
              <CommentsThread
                apiBase={`/api/involvements/${item.id}/comments`}
                initialCount={item.commentCount}
                readOnly={readOnly ? !item.allowComments : false}
                emptyHint={
                  item.allowComments
                    ? "No comments yet."
                    : "The owner has turned off new comments."
                }
                composerPlaceholder="Comment for the team…"
              />
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function Chip({
  href,
  external,
  children,
}: {
  href: string;
  external?: boolean;
  children: React.ReactNode;
}) {
  const cls =
    "inline-flex items-center gap-1 rounded-full border bg-slate-50 px-2 py-0.5 text-xs font-medium text-slate-600 hover:text-slate-900 max-w-[240px] truncate";
  return external ? (
    <a href={href} target="_blank" rel="noopener" className={cls}>
      {children}
    </a>
  ) : (
    <Link href={href} className={cls}>
      {children}
    </Link>
  );
}

function IconBtn({
  children,
  title,
  onClick,
  disabled,
  danger,
}: {
  children: React.ReactNode;
  title: string;
  onClick?: () => void;
  disabled?: boolean;
  danger?: boolean;
}) {
  return (
    <button
      type="button"
      title={title}
      onClick={onClick}
      disabled={disabled}
      className={cn(
        "inline-flex h-8 w-8 items-center justify-center rounded-lg text-slate-400 transition-colors hover:bg-slate-100 disabled:opacity-40",
        danger ? "hover:text-[var(--c-red)]" : "hover:text-slate-700",
      )}
    >
      {children}
    </button>
  );
}

function InvolvementDialog({
  item,
  students,
  tasks,
  events,
  driveRoots,
  onClose,
}: {
  item: Involvement | null;
  students: StudentOpt[];
  tasks: TaskOpt[];
  events: EventOpt[];
  driveRoots: DriveRoot[];
  onClose: () => void;
}) {
  const router = useRouter();
  const [title, setTitle] = useState(item?.title ?? "");
  const [notes, setNotes] = useState(item?.notes ?? "");
  const [progress, setProgress] = useState(item?.progress ?? 0);
  const [checklist, setChecklist] = useState<ChecklistItem[]>(
    item?.checklist ?? [],
  );
  const [newItem, setNewItem] = useState("");
  const [status, setStatus] = useState<"active" | "paused" | "done">(
    item?.status ?? "active",
  );
  const [priority, setPriority] = useState<"high" | "medium" | "low">(
    item?.priority ?? "medium",
  );
  const derived =
    checklist.length > 0
      ? Math.round(
          (checklist.filter((c) => c.done).length / checklist.length) * 100,
        )
      : null;

  function addChecklistItem() {
    const t = newItem.trim();
    if (!t) return;
    setChecklist((prev) => [...prev, { id: newRowId(), text: t, done: false }]);
    setNewItem("");
  }
  function moveChecklistItem(index: number, dir: -1 | 1) {
    setChecklist((prev) => {
      const j = index + dir;
      if (j < 0 || j >= prev.length) return prev;
      const next = [...prev];
      [next[index], next[j]] = [next[j], next[index]];
      return next;
    });
  }
  const [shared, setShared] = useState(item?.shared ?? false);
  const [allowComments, setAllowComments] = useState(
    item?.allowComments ?? false,
  );
  const [links, setLinks] = useState<ExternalLink[]>(item?.links ?? []);
  const [driveUrl, setDriveUrl] = useState<string | null>(
    item?.driveFolderUrl ?? null,
  );
  const [studentId, setStudentId] = useState(item?.student?.id ?? "");
  const [taskId, setTaskId] = useState(item?.task?.id ?? "");
  const [eventId, setEventId] = useState(item?.event?.id ?? "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const driveId = driveUrl ? driveUrl.match(DRIVE_FOLDER_URL_RE)?.[1] ?? null : null;

  async function submit() {
    if (!title.trim()) return;
    setSaving(true);
    setError(null);
    const payload = {
      title: title.trim(),
      notes: notes.trim() || null,
      progress,
      checklist,
      status,
      priority,
      shared,
      allowComments,
      links,
      driveFolderUrl: driveUrl,
      studentId: studentId || null,
      linkedTaskId: taskId || null,
      linkedEventId: eventId || null,
    };
    const r = await fetch(
      item ? `/api/involvements/${item.id}` : "/api/involvements",
      {
        method: item ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      },
    );
    if (!r.ok) {
      const j = await r.json().catch(() => ({}));
      setError(j.error ?? "Could not save.");
      setSaving(false);
      return;
    }
    router.refresh();
    onClose();
  }

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="!max-w-lg">
        <DialogHeader>
          <DialogTitle>{item ? "Edit item" : "New item"}</DialogTitle>
        </DialogHeader>
        {/* NOT a <form>: LinksSection renders its own <form>, and nested
            forms are invalid — the inner one gets dropped and its "Add link"
            button would submit this dialog instead. Save via a button click. */}
        <div className="max-h-[70vh] space-y-3 overflow-y-auto pr-1">
          <div>
            <label className="mb-1 block text-xs font-semibold text-slate-600">
              Title
            </label>
            <Input
              autoFocus
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g. Chips JU proposal · WP3 lead"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-semibold text-slate-600">
              Notes <span className="font-normal text-slate-400">(optional)</span>
            </label>
            <Textarea
              rows={2}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="What it involves, next step, who else…"
            />
          </div>

          {/* Checklist — ticking items drives the % automatically. */}
          <div>
            <label className="mb-1 block text-xs font-semibold text-slate-600">
              Checklist{" "}
              <span className="font-normal text-slate-400">
                (optional — ticking items sets the progress %)
              </span>
            </label>
            {checklist.length > 0 && (
              <ul className="mb-1.5 space-y-1">
                {checklist.map((c, idx) => (
                  <li key={c.id} className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      checked={c.done}
                      onChange={() =>
                        setChecklist((prev) =>
                          prev.map((x) =>
                            x.id === c.id ? { ...x, done: !x.done } : x,
                          ),
                        )
                      }
                      className="h-4 w-4 shrink-0 accent-[var(--c-teal)]"
                    />
                    <Input
                      value={c.text}
                      onChange={(e) =>
                        setChecklist((prev) =>
                          prev.map((x) =>
                            x.id === c.id ? { ...x, text: e.target.value } : x,
                          ),
                        )
                      }
                      className="!h-8 flex-1 !text-sm"
                    />
                    <div className="flex shrink-0 items-center">
                      <button
                        type="button"
                        onClick={() => moveChecklistItem(idx, -1)}
                        disabled={idx === 0}
                        className="text-slate-400 hover:text-slate-700 disabled:opacity-30"
                        title="Move up"
                      >
                        <ArrowUp className="h-4 w-4" />
                      </button>
                      <button
                        type="button"
                        onClick={() => moveChecklistItem(idx, 1)}
                        disabled={idx === checklist.length - 1}
                        className="text-slate-400 hover:text-slate-700 disabled:opacity-30"
                        title="Move down"
                      >
                        <ArrowDown className="h-4 w-4" />
                      </button>
                    </div>
                    <button
                      type="button"
                      onClick={() =>
                        setChecklist((prev) => prev.filter((x) => x.id !== c.id))
                      }
                      className="shrink-0 text-slate-400 hover:text-[var(--c-red)]"
                      title="Remove"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </li>
                ))}
              </ul>
            )}
            <div className="flex gap-2">
              <Input
                value={newItem}
                onChange={(e) => setNewItem(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    addChecklistItem();
                  }
                }}
                placeholder="Add a step and press Enter…"
                className="!h-8 flex-1 !text-sm"
              />
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={addChecklistItem}
                disabled={!newItem.trim()}
              >
                Add
              </Button>
            </div>
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <div>
              <label className="mb-1 block text-xs font-semibold text-slate-600">
                Progress
                {derived !== null && (
                  <span className="ml-1 font-normal text-slate-400">
                    (from checklist)
                  </span>
                )}
              </label>
              {derived !== null ? (
                <div className="flex items-center gap-2 pt-1.5">
                  <div className="h-2 flex-1 overflow-hidden rounded-full bg-slate-100">
                    <div
                      className="h-full rounded-full bg-[var(--c-teal)] transition-all"
                      style={{ width: `${derived}%` }}
                    />
                  </div>
                  <span className="w-9 text-right text-xs font-semibold text-slate-500 tabular-nums">
                    {derived}%
                  </span>
                </div>
              ) : (
                <div className="flex items-center gap-2 pt-1.5">
                  <input
                    type="range"
                    min={0}
                    max={100}
                    step={5}
                    value={progress}
                    onChange={(e) => setProgress(Number(e.target.value))}
                    className="w-full accent-[var(--c-teal)]"
                  />
                  <span className="w-9 text-right text-xs font-semibold text-slate-500 tabular-nums">
                    {progress}%
                  </span>
                </div>
              )}
            </div>
            <div>
              <label className="mb-1 block text-xs font-semibold text-slate-600">
                Priority
              </label>
              <Select
                value={priority}
                onChange={(e) =>
                  setPriority(e.target.value as "high" | "medium" | "low")
                }
              >
                <option value="high">High</option>
                <option value="medium">Medium</option>
                <option value="low">Low</option>
              </Select>
            </div>
            <div>
              <label className="mb-1 block text-xs font-semibold text-slate-600">
                Status
              </label>
              <Select
                value={status}
                onChange={(e) =>
                  setStatus(e.target.value as "active" | "paused" | "done")
                }
              >
                <option value="active">Active</option>
                <option value="paused">Paused</option>
                <option value="done">Done</option>
              </Select>
            </div>
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <div>
              <label className="mb-1 block text-xs font-semibold text-slate-600">
                Student
              </label>
              <Select value={studentId} onChange={(e) => setStudentId(e.target.value)}>
                <option value="">— none —</option>
                {students.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </Select>
            </div>
            <div>
              <label className="mb-1 block text-xs font-semibold text-slate-600">
                Task
              </label>
              <Select value={taskId} onChange={(e) => setTaskId(e.target.value)}>
                <option value="">— none —</option>
                {tasks.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.title}
                    {t.studentName ? ` · ${t.studentName}` : ""}
                  </option>
                ))}
              </Select>
            </div>
            <div>
              <label className="mb-1 block text-xs font-semibold text-slate-600">
                Event
              </label>
              <Select value={eventId} onChange={(e) => setEventId(e.target.value)}>
                <option value="">— none —</option>
                {events.map((ev) => (
                  <option key={ev.id} value={ev.id}>
                    {ev.title}
                  </option>
                ))}
              </Select>
            </div>
          </div>

          <div>
            <label className="mb-1 block text-xs font-semibold text-slate-600">
              Links <span className="font-normal text-slate-400">(papers, Drive files, repos…)</span>
            </label>
            <LinksSection initialLinks={links} save={(next) => setLinks(next)} />
          </div>

          <div>
            <label className="mb-1 flex items-center gap-1.5 text-xs font-semibold text-slate-600">
              <FolderOpen className="h-3 w-3" /> Drive folder
            </label>
            <DriveFolderPicker
              value={driveId}
              onChange={(folderId) =>
                setDriveUrl(
                  folderId
                    ? `https://drive.google.com/drive/folders/${folderId}`
                    : null,
                )
              }
              triggerLabel={driveUrl ? "Change folder" : "Pick from Drive"}
              roots={driveRoots}
            />
          </div>

          <div className="rounded-lg border bg-slate-50 px-3 py-2">
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={shared}
                onChange={(e) => setShared(e.target.checked)}
                className="h-4 w-4 accent-[var(--c-teal)]"
              />
              <span>
                <span className="font-medium text-slate-700">
                  Share with the senior team
                </span>
                <span className="block text-xs text-slate-400">
                  Others can see this item (read-only). Off = private to you.
                </span>
              </span>
            </label>
            <label
              className={cn(
                "mt-2 flex items-center gap-2 border-t pt-2 text-sm",
                !shared && "opacity-50",
              )}
            >
              <input
                type="checkbox"
                checked={allowComments}
                disabled={!shared}
                onChange={(e) => setAllowComments(e.target.checked)}
                className="h-4 w-4 accent-[var(--c-teal)]"
              />
              <span>
                <span className="font-medium text-slate-700">
                  Let the team comment
                </span>
                <span className="block text-xs text-slate-400">
                  Other senior members can add comments. Only when shared.
                </span>
              </span>
            </label>
          </div>

          {error && <p className="text-xs text-[var(--c-red)]">{error}</p>}
          <div className="flex justify-end gap-2 border-t pt-3">
            <Button type="button" variant="ghost" onClick={onClose}>
              Cancel
            </Button>
            <Button
              type="button"
              variant="brand"
              disabled={saving || !title.trim()}
              onClick={submit}
            >
              {saving ? "Saving…" : item ? "Save changes" : "Create"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
