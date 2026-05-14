"use client";
import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { format, isBefore, isToday, isTomorrow } from "date-fns";
import { nanoid } from "nanoid";
import {
  Plus,
  Filter,
  MessageSquare,
  FolderOpen,
  Calendar,
  AlertCircle,
  CheckSquare,
  X,
} from "lucide-react";
import { Avatar } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input, Select, Textarea } from "@/components/ui/input";
import {
  STATUSES,
  PRIORITIES,
  CATEGORIES,
  statusColor,
  priorityColor,
  categoryColor,
  isOtherCategory,
} from "@/lib/kanban-constants";
import { cn, relativeTime, displayName } from "@/lib/utils";

export interface Ticket {
  id: string;
  title: string;
  description: string | null;
  status: string;
  priority: string;
  category: string;
  dueDate: string | null;
  driveFolderUrl: string | null;
  channelId: string | null;
  order: number;
  commentCount: number;
  assignee: {
    id: string;
    name: string | null;
    image: string | null;
    color: string;
  } | null;
  student: { id: string; fullName: string; alias: string | null; color: string };
  tags: { id: string; label: string; color: string }[];
  subtasks: Subtask[];
  updatedAt: string;
}

export interface Subtask {
  id: string;
  text: string;
  done: boolean;
}

interface Member {
  id: string;
  name: string | null;
  image: string | null;
  color: string;
  role: string;
}

interface Props {
  tickets: Ticket[];
  students: { id: string; fullName: string; alias: string | null; color: string; avatarUrl: string | null }[];
  teamMembers: Member[];
  filterStudent: string | null;
  openTicketId: string | null;
  autoOpenNew: boolean;
  viewerId: string;
  viewerRole: string;
  viewerStudentId: string | null;
  viewerTeamMembers: Member[];
  highlightByTicket: Record<string, "new" | "updated">;
}

export function KanbanBoard({
  tickets: initial,
  students,
  teamMembers,
  filterStudent,
  openTicketId,
  autoOpenNew,
  viewerId,
  viewerRole,
  viewerStudentId,
  viewerTeamMembers,
  highlightByTicket: initialHighlights,
}: Props) {
  const isStudent = viewerRole === "student";
  const [highlightByTicket, setHighlightByTicket] = useState<Record<string, "new" | "updated">>(initialHighlights);
  // Tickets the user has clicked on this session — clears their highlight,
  // and stays cleared even as the poll re-returns the highlight from the server.
  const [dismissedHighlights, setDismissedHighlights] = useState<Set<string>>(new Set());

  // Assignee options for students: their team (primary supervisor + co-supervisors)
  // plus themselves. For supervisors/admins: the full team list.
  const assigneeOptions = useMemo<Member[]>(() => {
    if (!isStudent) return teamMembers;
    const meMember: Member | null =
      teamMembers.find((m) => m.id === viewerId) ??
      // students aren't in teamMembers (role=student); synthesize a row
      ({
        id: viewerId,
        name: "Me",
        image: null,
        color: "#ff7a45",
        role: "student",
      } satisfies Member);
    const ids = new Set<string>([viewerId]);
    const list: Member[] = [meMember];
    for (const m of viewerTeamMembers) {
      if (!ids.has(m.id)) {
        ids.add(m.id);
        list.push(m);
      }
    }
    return list;
  }, [isStudent, teamMembers, viewerTeamMembers, viewerId]);
  const [tickets, setTickets] = useState<Ticket[]>(initial);
  const [studentFilter, setStudentFilter] = useState<string>(filterStudent ?? "");
  const [priorityFilter, setPriorityFilter] = useState<string>("");
  const [categoryFilter, setCategoryFilter] = useState<string>("");
  const [search, setSearch] = useState("");
  const [openId, setOpenId] = useState<string | null>(openTicketId);
  const [newOpen, setNewOpen] = useState(autoOpenNew);
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [hoverStatus, setHoverStatus] = useState<string | null>(null);
  const router = useRouter();
  const [, startTransition] = useTransition();

  const filtered = useMemo(() => {
    return tickets.filter((t) => {
      if (studentFilter && t.student.id !== studentFilter) return false;
      if (priorityFilter && t.priority !== priorityFilter) return false;
      if (categoryFilter === "other") {
        // "Other" matches literal "other" + any custom user-typed label.
        if (!isOtherCategory(t.category)) return false;
      } else if (categoryFilter && t.category !== categoryFilter) {
        return false;
      }
      if (
        search &&
        !t.title.toLowerCase().includes(search.toLowerCase()) &&
        !(t.description ?? "").toLowerCase().includes(search.toLowerCase())
      )
        return false;
      return true;
    });
  }, [tickets, studentFilter, priorityFilter, categoryFilter, search]);

  const grouped = useMemo(() => {
    const m: Record<string, Ticket[]> = {};
    for (const s of STATUSES) m[s.id] = [];
    for (const t of filtered) (m[t.status] ??= []).push(t);
    return m;
  }, [filtered]);

  // Poll for ticket changes so the board updates without a full page reload.
  // Slower when user is dragging or has a dialog open (to avoid clobbering UX).
  useEffect(() => {
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | null = null;

    async function tick() {
      // Skip while dragging or while a dialog is open to avoid yanking state.
      if (!draggingId && !newOpen && !openId) {
        try {
          const r = await fetch(
            `/api/tickets/list${studentFilter ? `?student=${encodeURIComponent(studentFilter)}` : ""}`,
            { cache: "no-store" },
          );
          if (!cancelled && r.ok) {
            const j = await r.json();
            setTickets(j.tickets);
            setHighlightByTicket(j.highlightByTicket ?? {});
          }
        } catch {
          // ignore transient network errors
        }
      }
      if (!cancelled) timer = setTimeout(tick, 8000);
    }
    timer = setTimeout(tick, 8000);
    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
    };
  }, [draggingId, newOpen, openId, studentFilter]);

  async function moveTicket(id: string, status: string) {
    // optimistic
    setTickets((prev) =>
      prev.map((t) => (t.id === id ? { ...t, status } : t)),
    );
    const res = await fetch(`/api/tickets/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status }),
    });
    if (!res.ok) {
      // revert
      router.refresh();
    }
  }

  const openTicket = tickets.find((t) => t.id === openId) ?? null;

  return (
    <div className="flex flex-col h-[calc(100vh-4rem)] w-full min-w-0">
      <div className="px-6 lg:px-8 py-4 border-b bg-white space-y-3">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h1 className="text-2xl font-bold text-slate-900">Kanban</h1>
            <p className="text-sm text-slate-500 mt-1">
              {filtered.length} of {tickets.length} task
              {tickets.length === 1 ? "" : "s"}
            </p>
          </div>
          <Button variant="brand" onClick={() => setNewOpen(true)} className="shrink-0">
            <Plus className="h-4 w-4" /> New task
          </Button>
        </div>
        <div className="flex flex-wrap gap-2">
          <div className="relative grow basis-44 max-w-xs">
            <Filter className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400 pointer-events-none" />
            <Input
              placeholder="Search…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="!h-9 !w-full !pl-8"
            />
          </div>
          <Select
            value={studentFilter}
            onChange={(e) => setStudentFilter(e.target.value)}
            className="!w-auto grow-0 basis-44 max-w-xs"
          >
            <option value="">All students</option>
            {students.map((s) => (
              <option key={s.id} value={s.id}>
                {displayName(s)}
              </option>
            ))}
          </Select>
          <Select
            value={priorityFilter}
            onChange={(e) => setPriorityFilter(e.target.value)}
            className="!w-auto grow-0 basis-32 max-w-[10rem]"
          >
            <option value="">Any priority</option>
            {PRIORITIES.map((p) => (
              <option key={p.id} value={p.id}>
                {p.label}
              </option>
            ))}
          </Select>
          <Select
            value={categoryFilter}
            onChange={(e) => setCategoryFilter(e.target.value)}
            className="!w-auto grow-0 basis-36 max-w-[11rem]"
          >
            <option value="">Any category</option>
            {CATEGORIES.map((c) => (
              <option key={c.id} value={c.id}>
                {c.label}
              </option>
            ))}
          </Select>
        </div>
      </div>

      <div className="flex-1 min-w-0 overflow-x-auto">
        <div className="flex gap-4 p-6 lg:p-8 min-w-max h-full">
          {STATUSES.map((col) => (
            <div
              key={col.id}
              className={cn(
                "flex flex-col w-80 shrink-0 rounded-2xl bg-slate-100/80 transition-colors",
                hoverStatus === col.id && "ring-2 ring-offset-2",
              )}
              style={{
                // @ts-expect-error css var
                "--ring-color": col.color,
              }}
              onDragOver={(e) => {
                if (!draggingId) return;
                e.preventDefault();
                setHoverStatus(col.id);
              }}
              onDragLeave={() => setHoverStatus(null)}
              onDrop={(e) => {
                e.preventDefault();
                if (draggingId) {
                  startTransition(() => moveTicket(draggingId, col.id));
                }
                setHoverStatus(null);
                setDraggingId(null);
              }}
            >
              <div className="flex items-center justify-between px-4 py-3 sticky top-0">
                <div className="flex items-center gap-2">
                  <span
                    className="h-2.5 w-2.5 rounded-full"
                    style={{ background: col.color }}
                  />
                  <span className="text-sm font-semibold text-slate-700">
                    {col.label}
                  </span>
                  <span className="rounded-full bg-white px-2 py-0.5 text-xs font-semibold text-slate-600 border">
                    {grouped[col.id]?.length ?? 0}
                  </span>
                </div>
              </div>
              <div className="flex-1 overflow-y-auto px-2 pb-3 space-y-2">
                {(grouped[col.id] ?? []).map((t) => (
                  <TicketCard
                    key={t.id}
                    ticket={t}
                    highlightKind={
                      dismissedHighlights.has(t.id)
                        ? null
                        : highlightByTicket[t.id] ?? null
                    }
                    onClick={() => {
                      setOpenId(t.id);
                      // Acknowledge: clear the new/updated indicator for this ticket,
                      // both locally and on the server (so the sidebar bubble drops).
                      const wasHighlighted = !!highlightByTicket[t.id] && !dismissedHighlights.has(t.id);
                      setDismissedHighlights((prev) => {
                        if (prev.has(t.id)) return prev;
                        const next = new Set(prev);
                        next.add(t.id);
                        return next;
                      });
                      if (wasHighlighted) {
                        fetch("/api/kanban/dismiss", {
                          method: "POST",
                          headers: { "Content-Type": "application/json" },
                          body: JSON.stringify({ ticketId: t.id }),
                        }).catch(() => {});
                      }
                    }}
                    onDragStart={() => setDraggingId(t.id)}
                    onDragEnd={() => {
                      setDraggingId(null);
                      setHoverStatus(null);
                    }}
                  />
                ))}
                {(grouped[col.id]?.length ?? 0) === 0 && (
                  <button
                    onClick={() => setNewOpen(true)}
                    className="block w-full rounded-xl border-2 border-dashed border-slate-300 p-4 text-center text-xs text-slate-400 hover:border-slate-400 hover:text-slate-600"
                  >
                    + drop or add
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>

      <NewTicketDialog
        open={newOpen}
        onOpenChange={setNewOpen}
        students={students}
        teamMembers={teamMembers}
        assigneeOptions={assigneeOptions}
        defaultStudentId={
          isStudent && viewerStudentId
            ? viewerStudentId
            : studentFilter || null
        }
        isStudent={isStudent}
        viewerId={viewerId}
        onCreated={(t) => {
          setTickets((prev) => [t, ...prev]);
          setNewOpen(false);
          setOpenId(t.id);
        }}
      />

      <TicketDetailDialog
        ticket={openTicket}
        open={!!openTicket}
        onOpenChange={(o) => !o && setOpenId(null)}
        students={students}
        teamMembers={assigneeOptions}
        onChange={(updated) => {
          setTickets((prev) => prev.map((t) => (t.id === updated.id ? updated : t)));
        }}
        onDeleted={(id) => {
          setTickets((prev) => prev.filter((t) => t.id !== id));
          setOpenId(null);
        }}
      />
    </div>
  );
}

function TicketCard({
  ticket,
  highlightKind,
  onClick,
  onDragStart,
  onDragEnd,
}: {
  ticket: Ticket;
  highlightKind: "new" | "updated" | null;
  onClick: () => void;
  onDragStart: () => void;
  onDragEnd: () => void;
}) {
  const due = ticket.dueDate ? new Date(ticket.dueDate) : null;
  const overdue = due && isBefore(due, new Date()) && ticket.status !== "done";
  const isNew = highlightKind === "new";
  const isUpdated = highlightKind === "updated";
  const highlight = !!highlightKind;
  return (
    <div
      draggable
      onDragStart={onDragStart}
      onDragEnd={onDragEnd}
      onClick={onClick}
      className={cn(
        "relative cursor-grab active:cursor-grabbing select-none rounded-xl shadow-sm hover:shadow-md hover:-translate-y-0.5 transition-all overflow-hidden",
        isNew && "border-2 border-[var(--c-red)] shadow-lg shadow-red-300/50 animate-pulse-red text-white",
        isUpdated && "border-2 border-[var(--c-blue)] shadow-lg shadow-blue-300/50 animate-pulse-blue text-white",
        !highlight && "border bg-white",
      )}
      style={
        isNew
          ? { background: "var(--c-red)" }
          : isUpdated
          ? { background: "var(--c-blue)" }
          : undefined
      }
    >
      {/* Bold banner at top for highlighted tickets, replacing the thin colored stripe */}
      {highlight ? (
        <div
          className={cn(
            "flex items-center justify-between gap-2 px-3 py-1 text-[10px] font-bold uppercase tracking-wider text-white border-b border-white/30",
          )}
        >
          <span className="flex items-center gap-1.5">
            <span className="h-1.5 w-1.5 rounded-full bg-white animate-pulse" />
            {isNew ? "new task" : "updated"}
          </span>
          <span
            className="h-1.5 w-1.5 rounded-full"
            style={{ background: ticket.student.color, boxShadow: "0 0 0 2px white" }}
            title="student color"
          />
        </div>
      ) : (
        <div className="h-1" style={{ background: ticket.student.color }} />
      )}
      <div className="p-3">
        <div className="flex items-start justify-between gap-2">
          <div
            className={cn(
              "text-sm font-medium leading-snug flex-1 min-w-0",
              highlight ? "text-white" : "text-slate-900",
            )}
          >
            {ticket.title}
          </div>
          <div className="flex items-center gap-1 shrink-0">
            <Badge
              color={highlight ? "#ffffff" : priorityColor(ticket.priority)}
              variant={highlight ? "outline" : "solid"}
              className="!text-[10px] !px-1.5 !py-0"
            >
              {ticket.priority[0]!.toUpperCase()}
            </Badge>
          </div>
        </div>
        <div className="mt-2 flex flex-wrap gap-1">
          <Badge
            color={highlight ? "#ffffff" : categoryColor(ticket.category)}
            variant={highlight ? "outline" : "soft"}
          >
            {ticket.category}
          </Badge>
          {ticket.tags.map((tag) => (
            <Badge
              key={tag.id}
              color={highlight ? "#ffffff" : tag.color}
              variant={highlight ? "outline" : "soft"}
            >
              {tag.label}
            </Badge>
          ))}
        </div>

        <div className="mt-3 flex items-center justify-between gap-2">
          <Link
            href={`/students/${ticket.student.id}`}
            onClick={(e) => e.stopPropagation()}
            className={cn(
              "flex items-center gap-1.5 text-xs min-w-0",
              highlight
                ? "text-white/90 hover:text-white"
                : "text-slate-500 hover:text-slate-900",
            )}
          >
            <span
              className="h-2 w-2 rounded-full shrink-0"
              style={{ background: highlight ? "#ffffff" : ticket.student.color }}
            />
            <span className="truncate">{displayName(ticket.student)}</span>
          </Link>
          {ticket.assignee && (
            <Avatar
              name={ticket.assignee.name}
              src={ticket.assignee.image}
              color={ticket.assignee.color}
              size="xs"
            />
          )}
        </div>

        <div
          className={cn(
            "mt-3 flex items-center justify-between text-xs gap-2",
            highlight ? "text-white/85" : "text-slate-500",
          )}
        >
          {due ? (
            <span
              className={cn(
                "flex items-center gap-1",
                overdue &&
                  (highlight
                    ? "font-semibold"
                    : "text-[var(--c-red)] font-semibold"),
              )}
            >
              {overdue && <AlertCircle className="h-3 w-3" />}
              <Calendar className="h-3 w-3" />
              {isToday(due)
                ? "today"
                : isTomorrow(due)
                ? "tomorrow"
                : format(due, "MMM d")}
            </span>
          ) : (
            <span className={highlight ? "text-white/60" : "text-slate-400"}>
              no due date
            </span>
          )}
          <div
            className={cn(
              "flex items-center gap-2",
              highlight ? "text-white/70" : "text-slate-400",
            )}
          >
            {ticket.subtasks.length > 0 && (
              <span
                className="flex items-center gap-0.5"
                title={`${ticket.subtasks.filter((s) => s.done).length} of ${ticket.subtasks.length} subtasks done`}
              >
                <CheckSquare className="h-3 w-3" />
                {ticket.subtasks.filter((s) => s.done).length}/{ticket.subtasks.length}
              </span>
            )}
            {ticket.commentCount > 0 && (
              <span className="flex items-center gap-0.5">
                <MessageSquare className="h-3 w-3" /> {ticket.commentCount}
              </span>
            )}
            {ticket.driveFolderUrl && <FolderOpen className="h-3 w-3" />}
            {ticket.channelId && <MessageSquare className="h-3 w-3" />}
          </div>
        </div>
      </div>
    </div>
  );
}

function NewTicketDialog({
  open,
  onOpenChange,
  students,
  teamMembers,
  assigneeOptions,
  defaultStudentId,
  isStudent,
  viewerId,
  onCreated,
}: {
  open: boolean;
  onOpenChange: (b: boolean) => void;
  students: Props["students"];
  teamMembers: Member[];
  assigneeOptions: Member[];
  defaultStudentId: string | null;
  isStudent: boolean;
  viewerId: string;
  onCreated: (t: Ticket) => void;
}) {
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [category, setCategory] = useState<string>("research");
  const [customCategory, setCustomCategory] = useState<string>("");

  // Use teamMembers var to satisfy unused-var when we don't render the full list
  void teamMembers;

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    const fd = new FormData(e.currentTarget);
    const payload = Object.fromEntries(fd.entries()) as Record<string, string>;
    const customTrim = customCategory.trim();
    payload.category = category === "other" && customTrim ? customTrim : category;
    if (isStudent) {
      // Force studentId to self
      if (defaultStudentId) payload.studentId = defaultStudentId;
      // assigneeId comes from the form select (restricted list); fall back to self
      if (!payload.assigneeId) payload.assigneeId = viewerId;
    }
    const res = await fetch("/api/tickets", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    setSubmitting(false);
    if (!res.ok) {
      const j = await res.json().catch(() => ({}));
      setError(j.error ?? "Could not create task");
      return;
    }
    const { ticket } = await res.json();
    onCreated(ticket);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>New task</DialogTitle>
        </DialogHeader>
        <form onSubmit={onSubmit} className="space-y-3">
          <Field label="Title">
            <Input name="title" required autoFocus placeholder="What needs to be done?" />
          </Field>
          <Field label="Description">
            <Textarea name="description" rows={3} placeholder="optional context, links, references…" />
          </Field>
          {!isStudent ? (
            <div className="grid grid-cols-2 gap-3">
              <Field label="Student">
                <Select name="studentId" defaultValue={defaultStudentId ?? ""} required>
                  <option value="" disabled>Select…</option>
                  {students.map((s) => (
                    <option key={s.id} value={s.id}>{displayName(s)}</option>
                  ))}
                </Select>
              </Field>
              <Field label="Assignee">
                <Select name="assigneeId" defaultValue="">
                  <option value="">Unassigned</option>
                  {assigneeOptions.map((m) => (
                    <option key={m.id} value={m.id}>{m.name}</option>
                  ))}
                </Select>
              </Field>
            </div>
          ) : (
            <Field label="Assignee">
              <Select name="assigneeId" defaultValue={viewerId}>
                {assigneeOptions.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.id === viewerId ? "Me" : m.name}
                  </option>
                ))}
              </Select>
            </Field>
          )}
          <div className="grid grid-cols-3 gap-3">
            <Field label="Status">
              <Select name="status" defaultValue="todo">
                {STATUSES.map((s) => (
                  <option key={s.id} value={s.id}>{s.label}</option>
                ))}
              </Select>
            </Field>
            <Field label="Priority">
              <Select name="priority" defaultValue="medium">
                {PRIORITIES.map((p) => (
                  <option key={p.id} value={p.id}>{p.label}</option>
                ))}
              </Select>
            </Field>
            <Field label="Category">
              <Select
                value={category}
                onChange={(e) => setCategory(e.target.value)}
              >
                {CATEGORIES.map((c) => (
                  <option key={c.id} value={c.id}>{c.label}</option>
                ))}
              </Select>
              {category === "other" && (
                <Input
                  value={customCategory}
                  onChange={(e) => setCustomCategory(e.target.value)}
                  placeholder="Custom category (optional)"
                  className="mt-1.5"
                />
              )}
            </Field>
          </div>
          <Field label="Due date">
            <Input type="date" name="dueDate" />
          </Field>
          <Field label="Drive folder URL (optional)">
            <Input name="driveFolderUrl" placeholder="https://drive.google.com/…" />
          </Field>
          {error && (
            <div className="text-sm text-[var(--c-red)] bg-red-50 rounded-lg p-3">{error}</div>
          )}
          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
            <Button type="submit" variant="brand" disabled={submitting}>
              {submitting ? "Creating…" : "Create task"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function TicketDetailDialog({
  ticket,
  open,
  onOpenChange,
  teamMembers,
  onChange,
  onDeleted,
}: {
  ticket: Ticket | null;
  open: boolean;
  onOpenChange: (b: boolean) => void;
  students: Props["students"];
  teamMembers: Member[];
  onChange: (t: Ticket) => void;
  onDeleted: (id: string) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [customCategory, setCustomCategory] = useState<string>("");
  useEffect(() => {
    if (!ticket) return;
    setCustomCategory(
      isOtherCategory(ticket.category) && ticket.category !== "other"
        ? ticket.category
        : "",
    );
  }, [ticket?.id, ticket?.category]);
  // Debounce timer for text fields so we save changes without one PATCH per keystroke.
  const debounceTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  function debouncedSave(patch: Partial<Ticket> & { dueDate?: string | null }) {
    if (debounceTimer.current) clearTimeout(debounceTimer.current);
    debounceTimer.current = setTimeout(() => {
      // ticket may have been closed/changed in the meantime; check before calling
      update(patch);
    }, 600);
  }
  if (!ticket) return null;

  async function update(patch: Partial<Ticket> & { dueDate?: string | null }) {
    if (!ticket) return;
    const optimistic = { ...ticket, ...patch } as Ticket;
    onChange(optimistic);
    await fetch(`/api/tickets/${ticket.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(patch),
    });
  }

  async function del() {
    if (!ticket) return;
    if (!confirm("Delete this task?")) return;
    await fetch(`/api/tickets/${ticket.id}`, { method: "DELETE" });
    onDeleted(ticket.id);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="!max-w-2xl">
        <DialogHeader>
          <div className="flex items-start gap-3">
            <div
              className="h-10 w-1 rounded-full"
              style={{ background: statusColor(ticket.status) }}
            />
            <div className="flex-1">
              {editing ? (
                <Input
                  defaultValue={ticket.title}
                  onChange={(e) => debouncedSave({ title: e.target.value })}
                  onBlur={(e) => {
                    update({ title: e.target.value });
                    setEditing(false);
                  }}
                  autoFocus
                />
              ) : (
                <DialogTitle
                  className="cursor-text"
                  onClick={() => setEditing(true)}
                >
                  {ticket.title}
                </DialogTitle>
              )}
              <div className="text-xs text-slate-500 mt-1">
                for{" "}
                <Link
                  href={`/students/${ticket.student.id}`}
                  className="font-medium text-slate-700 hover:underline"
                >
                  {displayName(ticket.student)}
                </Link>{" "}
                · updated {relativeTime(ticket.updatedAt)}
              </div>
            </div>
          </div>
        </DialogHeader>

        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <Field label="Status">
              <Select
                value={ticket.status}
                onChange={(e) => update({ status: e.target.value })}
              >
                {STATUSES.map((s) => (
                  <option key={s.id} value={s.id}>{s.label}</option>
                ))}
              </Select>
            </Field>
            <Field label="Priority">
              <Select
                value={ticket.priority}
                onChange={(e) => update({ priority: e.target.value })}
              >
                {PRIORITIES.map((p) => (
                  <option key={p.id} value={p.id}>{p.label}</option>
                ))}
              </Select>
            </Field>
            <Field label="Category">
              <Select
                value={isOtherCategory(ticket.category) ? "other" : ticket.category}
                onChange={(e) => {
                  setCustomCategory("");
                  update({ category: e.target.value });
                }}
              >
                {CATEGORIES.map((c) => (
                  <option key={c.id} value={c.id}>{c.label}</option>
                ))}
              </Select>
              {isOtherCategory(ticket.category) && (
                <Input
                  value={customCategory}
                  onChange={(e) => {
                    setCustomCategory(e.target.value);
                    const v = e.target.value.trim();
                    debouncedSave({ category: v || "other" });
                  }}
                  placeholder="Custom category (optional)"
                  className="mt-1.5"
                />
              )}
            </Field>
            <Field label="Assignee">
              <Select
                value={ticket.assignee?.id ?? ""}
                onChange={(e) => {
                  const id = e.target.value || null;
                  const m = teamMembers.find((m) => m.id === id);
                  update({
                    assignee: m
                      ? { id: m.id, name: m.name, image: m.image, color: m.color }
                      : null,
                  });
                }}
              >
                <option value="">Unassigned</option>
                {teamMembers.map((m) => (
                  <option key={m.id} value={m.id}>{m.name}</option>
                ))}
              </Select>
            </Field>
            <Field label="Due date">
              <Input
                type="date"
                value={ticket.dueDate?.slice(0, 10) ?? ""}
                onChange={(e) => update({ dueDate: e.target.value || null })}
              />
            </Field>
            <Field label="Drive folder URL">
              <Input
                defaultValue={ticket.driveFolderUrl ?? ""}
                onChange={(e) =>
                  debouncedSave({ driveFolderUrl: e.target.value || null })
                }
                onBlur={(e) =>
                  update({ driveFolderUrl: e.target.value || null })
                }
                placeholder="paste from Drive"
              />
            </Field>
          </div>

          <Field label="Description">
            <Textarea
              defaultValue={ticket.description ?? ""}
              onChange={(e) => debouncedSave({ description: e.target.value })}
              onBlur={(e) => update({ description: e.target.value })}
              rows={4}
              placeholder="Context, links, notes…"
            />
          </Field>

          <SubtaskChecklist
            subtasks={ticket.subtasks}
            onChange={(next) => update({ subtasks: next } as Partial<Ticket>)}
          />

          <Comments ticketId={ticket.id} initialCount={ticket.commentCount} />

          <TicketHistory ticketId={ticket.id} />

          <div className="flex justify-between pt-2 border-t">
            <Button variant="danger" size="sm" onClick={del}>
              <X className="h-4 w-4" /> Delete
            </Button>
            <Button variant="outline" onClick={() => onOpenChange(false)}>
              Close
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function Comments({ ticketId, initialCount }: { ticketId: string; initialCount: number }) {
  type C = { id: string; body: string; author: { name: string | null; image: string | null; color: string }; createdAt: string };
  const [items, setItems] = useState<C[] | null>(null);
  const [body, setBody] = useState("");
  const [loaded, setLoaded] = useState(false);

  async function load() {
    const r = await fetch(`/api/tickets/${ticketId}/comments`);
    if (r.ok) {
      const j = await r.json();
      setItems(j.comments);
      setLoaded(true);
    }
  }
  if (!loaded) load();

  async function send(e: React.FormEvent) {
    e.preventDefault();
    if (!body.trim()) return;
    const r = await fetch(`/api/tickets/${ticketId}/comments`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ body }),
    });
    if (r.ok) {
      const { comment } = await r.json();
      setItems((prev) => [...(prev ?? []), comment]);
      setBody("");
    }
  }

  return (
    <div>
      <div className="text-xs font-semibold uppercase text-slate-500 mb-2">
        Comments {items ? `(${items.length})` : `(${initialCount})`}
      </div>
      <div className="space-y-2 max-h-48 overflow-y-auto pr-1">
        {(items ?? []).map((c) => (
          <div key={c.id} className="flex gap-2">
            <Avatar
              name={c.author.name}
              src={c.author.image}
              color={c.author.color}
              size="xs"
            />
            <div className="flex-1 rounded-lg bg-slate-50 p-2 text-sm">
              <div className="text-[10px] font-semibold text-slate-500 mb-0.5">
                {c.author.name} · {relativeTime(c.createdAt)}
              </div>
              <div className="text-slate-800 whitespace-pre-wrap">{c.body}</div>
            </div>
          </div>
        ))}
        {items?.length === 0 && (
          <p className="text-xs text-slate-400 italic">No comments yet.</p>
        )}
      </div>
      <form onSubmit={send} className="mt-3 flex gap-2">
        <Input
          value={body}
          onChange={(e) => setBody(e.target.value)}
          placeholder="Add a comment…"
        />
        <Button type="submit" variant="default" size="sm">Send</Button>
      </form>
    </div>
  );
}

const HISTORY_ACTION_LABEL: Record<string, { label: string; color: string }> = {
  "ticket.create": { label: "created", color: "#00ca72" },
  "ticket.update": { label: "updated", color: "#2196f3" },
  "ticket.delete": { label: "deleted", color: "#e2445c" },
};

type HistoryEntry = {
  id: string;
  action: string;
  summary: string;
  details: string | null;
  createdAt: string;
  actor: {
    id: string;
    name: string | null;
    email: string;
    image: string | null;
    color: string;
  };
  actorRoleAtTime: string | null;
};

function TicketHistory({ ticketId }: { ticketId: string }) {
  const [open, setOpen] = useState(false);
  const [entries, setEntries] = useState<HistoryEntry[] | null>(null);
  const [loaded, setLoaded] = useState(false);

  async function load() {
    if (loaded) return;
    const r = await fetch(`/api/tickets/${ticketId}/history`);
    if (r.ok) {
      const j = await r.json();
      setEntries(j.entries);
      setLoaded(true);
    }
  }

  function toggle() {
    const next = !open;
    setOpen(next);
    if (next) load();
  }

  const count = entries?.length ?? 0;

  return (
    <div>
      <button
        type="button"
        onClick={toggle}
        className="flex items-center gap-2 text-xs font-semibold uppercase text-slate-500 hover:text-slate-900"
      >
        <span>History {loaded && `(${count})`}</span>
        <span className="text-[10px] text-slate-400">
          {open ? "hide" : "show"}
        </span>
      </button>
      {open && (
        <div className="mt-2 max-h-64 overflow-y-auto pr-1">
          {!loaded ? (
            <div className="text-xs text-slate-400 py-2">Loading…</div>
          ) : entries?.length === 0 ? (
            <p className="text-xs text-slate-400 italic py-2">
              No recorded changes yet.
            </p>
          ) : (
            <ol className="relative border-l-2 border-slate-100 ml-2 pl-3 space-y-2">
              {entries?.map((e) => {
                const meta = HISTORY_ACTION_LABEL[e.action] ?? {
                  label: e.action,
                  color: "#94a3b8",
                };
                const changedKeys = parseChangedKeys(e.details);
                return (
                  <li key={e.id} className="relative">
                    <span
                      className="absolute -left-[18px] top-1 h-3 w-3 rounded-full ring-2 ring-white"
                      style={{ background: meta.color }}
                    />
                    <div className="text-xs text-slate-700">
                      <span className="font-semibold text-slate-900">
                        {e.actor.name ?? e.actor.email}
                      </span>{" "}
                      <span
                        className="font-medium"
                        style={{ color: meta.color }}
                      >
                        {meta.label}
                      </span>{" "}
                      <span className="text-slate-500">
                        — {relativeTime(e.createdAt)}
                      </span>
                    </div>
                    <div className="text-[11px] text-slate-500 mt-0.5">
                      {e.summary}
                    </div>
                    {changedKeys.length > 0 && (
                      <div className="text-[10px] text-slate-400 mt-0.5">
                        changed: {changedKeys.join(", ")}
                      </div>
                    )}
                    <div className="text-[10px] text-slate-400">
                      {format(new Date(e.createdAt), "MMM d, HH:mm:ss")}
                    </div>
                  </li>
                );
              })}
            </ol>
          )}
        </div>
      )}
    </div>
  );
}

function parseChangedKeys(details: string | null): string[] {
  if (!details) return [];
  try {
    const parsed = JSON.parse(details);
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      return Object.keys(parsed);
    }
  } catch {
    // ignore
  }
  return [];
}

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <label className="block">
      <span className="text-xs font-semibold text-slate-700">{label}</span>
      <div className="mt-1">{children}</div>
    </label>
  );
}

function SubtaskChecklist({
  subtasks,
  onChange,
}: {
  subtasks: Subtask[];
  onChange: (next: Subtask[]) => void;
}) {
  const [draft, setDraft] = useState("");
  const done = subtasks.filter((s) => s.done).length;

  function toggle(id: string) {
    onChange(subtasks.map((s) => (s.id === id ? { ...s, done: !s.done } : s)));
  }
  function remove(id: string) {
    onChange(subtasks.filter((s) => s.id !== id));
  }
  function rename(id: string, text: string) {
    onChange(subtasks.map((s) => (s.id === id ? { ...s, text } : s)));
  }
  function add() {
    const text = draft.trim();
    if (!text) return;
    onChange([
      ...subtasks,
      { id: nanoid(8), text, done: false },
    ]);
    setDraft("");
  }

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <span className="text-xs font-semibold text-slate-700">Subtasks</span>
        {subtasks.length > 0 && (
          <span className="text-[10px] text-slate-500">
            {done} / {subtasks.length} done
          </span>
        )}
      </div>
      {subtasks.length > 0 && (
        <ul className="space-y-1">
          {subtasks.map((s) => (
            <li key={s.id} className="flex items-center gap-2 group">
              <input
                type="checkbox"
                checked={s.done}
                onChange={() => toggle(s.id)}
                className="h-4 w-4 rounded border-slate-300 text-[var(--c-violet)] focus:ring-[var(--c-violet)]"
              />
              <input
                type="text"
                value={s.text}
                onChange={(e) => rename(s.id, e.target.value)}
                className={cn(
                  "flex-1 bg-transparent text-sm focus:outline-none focus:bg-slate-50 rounded px-1",
                  s.done && "line-through text-slate-400",
                )}
              />
              <button
                type="button"
                onClick={() => remove(s.id)}
                className="text-slate-300 hover:text-[var(--c-red)] opacity-0 group-hover:opacity-100 transition-opacity"
                title="Remove subtask"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </li>
          ))}
        </ul>
      )}
      <div className="flex gap-2">
        <input
          type="text"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              add();
            }
          }}
          placeholder="Add a subtask…"
          className="flex-1 h-8 rounded-md border bg-white px-2 text-sm placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-[var(--ring)]/20"
        />
        <Button type="button" variant="outline" size="sm" onClick={add} disabled={!draft.trim()}>
          <Plus className="h-3.5 w-3.5" /> Add
        </Button>
      </div>
    </div>
  );
}
