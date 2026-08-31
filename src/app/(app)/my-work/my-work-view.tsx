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
  Users,
  GraduationCap,
  KanbanSquare,
  CalendarDays,
  FolderOpen,
  ExternalLink as ExternalLinkIcon,
  Briefcase,
  ChevronDown,
  ChevronRight,
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
import { linkify } from "@/lib/linkify";
import { cn } from "@/lib/utils";
import { statusColor } from "@/lib/kanban-constants";
import type { ExternalLink } from "@/lib/links";

const DRIVE_FOLDER_URL_RE = /\/folders\/([a-zA-Z0-9_-]+)/;

type Ref = { id: string; title: string; status?: string };
export type Involvement = {
  id: string;
  title: string;
  notes: string | null;
  progress: number;
  status: "active" | "paused" | "done";
  shared: boolean;
  pinned: boolean;
  links: ExternalLink[];
  driveFolderUrl: string | null;
  student: { id: string; name: string; color: string } | null;
  task: Ref | null;
  event: { id: string; title: string; startsAt: string } | null;
  owner: { id: string; name: string | null; color: string } | null;
  updatedAt: string;
};

type StudentOpt = { id: string; name: string; color: string };
type TaskOpt = { id: string; title: string; status: string; studentName: string };
type EventOpt = { id: string; title: string; startsAt: string };
type DriveRoot = { id: string; name: string; kind: "student" | "team" };

const STATUS_META: Record<string, { label: string; chip: string; bar: string }> = {
  active: { label: "Active", chip: "bg-violet-50 text-[var(--c-violet)]", bar: "var(--c-violet)" },
  paused: { label: "Paused", chip: "bg-amber-50 text-amber-600", bar: "#f59e0b" },
  done: { label: "Done", chip: "bg-emerald-50 text-emerald-600", bar: "var(--c-green)" },
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
  const [showShared, setShowShared] = useState(true);

  // Pinned first, then active/paused, then done — each group by recency.
  const sortedMine = useMemo(() => {
    const rank = (i: Involvement) =>
      i.pinned ? 0 : i.status === "done" ? 2 : 1;
    return [...mine].sort(
      (a, b) => rank(a) - rank(b) || b.updatedAt.localeCompare(a.updatedAt),
    );
  }, [mine]);

  return (
    <div className="mx-auto w-full max-w-4xl p-4 md:p-6">
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
        <Button variant="brand" onClick={() => setCreating(true)}>
          <Plus className="h-4 w-4" /> New item
        </Button>
      </div>

      {sortedMine.length === 0 ? (
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
      ) : (
        <ul className="space-y-3">
          {sortedMine.map((i) => (
            <li key={i.id}>
              <InvolvementCard
                item={i}
                onEdit={() => setEditing(i)}
              />
            </li>
          ))}
        </ul>
      )}

      {shared.length > 0 && (
        <div className="mt-8">
          <button
            type="button"
            onClick={() => setShowShared((v) => !v)}
            className="mb-3 flex items-center gap-1.5 text-sm font-semibold text-slate-600 hover:text-slate-900"
          >
            {showShared ? (
              <ChevronDown className="h-4 w-4" />
            ) : (
              <ChevronRight className="h-4 w-4" />
            )}
            <Users className="h-4 w-4" /> Shared by the team ({shared.length})
          </button>
          {showShared && (
            <ul className="space-y-3">
              {shared.map((i) => (
                <li key={i.id}>
                  <InvolvementCard item={i} readOnly />
                </li>
              ))}
            </ul>
          )}
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
  const sm = STATUS_META[item.status] ?? STATUS_META.active;

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
        "rounded-xl border bg-white p-4",
        item.pinned && !readOnly && "border-teal-200 bg-teal-50/30",
        item.status === "done" && "opacity-75",
      )}
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
            <span className={cn("rounded-full px-2 py-0.5 text-[10px] font-semibold", sm.chip)}>
              {sm.label}
            </span>
            {item.shared && !readOnly && (
              <span className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-medium text-slate-500">
                <Users className="h-3 w-3" /> Shared
              </span>
            )}
            {readOnly && item.owner && (
              <span className="inline-flex items-center gap-1 text-[11px] text-slate-400">
                <Avatar name={item.owner.name} src={null} color={item.owner.color} size="xs" />
                {item.owner.name}
              </span>
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
        <span className="w-9 shrink-0 text-right text-xs font-semibold text-slate-500 tabular-nums">
          {item.progress}%
        </span>
      </div>

      {item.notes && (
        <p className="mt-2 whitespace-pre-wrap text-sm text-slate-600 [overflow-wrap:anywhere]">
          {linkify(item.notes)}
        </p>
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
  const [status, setStatus] = useState<"active" | "paused" | "done">(
    item?.status ?? "active",
  );
  const [shared, setShared] = useState(item?.shared ?? false);
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

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!title.trim()) return;
    setSaving(true);
    setError(null);
    const payload = {
      title: title.trim(),
      notes: notes.trim() || null,
      progress,
      status,
      shared,
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
        <form onSubmit={submit} className="max-h-[70vh] space-y-3 overflow-y-auto pr-1">
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

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div>
              <label className="mb-1 block text-xs font-semibold text-slate-600">
                Progress: {progress}%
              </label>
              <input
                type="range"
                min={0}
                max={100}
                step={5}
                value={progress}
                onChange={(e) => setProgress(Number(e.target.value))}
                className="w-full accent-[var(--c-teal)]"
              />
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

          <label className="flex items-center gap-2 rounded-lg border bg-slate-50 px-3 py-2 text-sm">
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

          {error && <p className="text-xs text-[var(--c-red)]">{error}</p>}
          <div className="flex justify-end gap-2 border-t pt-3">
            <Button type="button" variant="ghost" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" variant="brand" disabled={saving || !title.trim()}>
              {saving ? "Saving…" : item ? "Save changes" : "Create"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
