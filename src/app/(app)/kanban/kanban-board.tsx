"use client";
import { Fragment, useEffect, useMemo, useRef, useState, useTransition } from "react";
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
  CalendarClock,
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
import { subtaskDueViolation } from "@/lib/subtasks";
import { GanttView } from "./gantt-view";
import { DriveFolderPicker } from "@/components/drive-folder-picker";
import { CommentsThread } from "@/components/comments-thread";
import { LinksSection } from "@/components/links-section";
import { useSectionVersion } from "@/components/app-shell/unread-provider";

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
  // Manually-linked calendar events (Event.linkedTaskId === this ticket id).
  // Excludes the auto due-date mirror and sub-task deadline events — they're
  // already represented elsewhere (the dueDate column, the subtasks list).
  linkedEventCount: number;
  linkedEvents?: { id: string; title: string; startsAt: string }[];
  // External links list (papers, websites, repos…). JSON-derived.
  links?: { id: string; label: string; url: string }[];
  assignee: {
    id: string;
    name: string | null;
    image: string | null;
    color: string;
  } | null;
  // For team-only / unassigned tasks the server provides a synthetic
  // "Team only" placeholder student (id: "__team__") so downstream code
  // can stay simple. The `teamOnly` / `isGeneral` flags below carry the
  // real intent.
  student: { id: string; fullName: string; alias: string | null; color: string };
  // True for unassigned non-general tasks (visible only to non-students).
  teamOnly: boolean;
  // True for unassigned general tasks (visible to everyone). Mutually
  // exclusive with teamOnly. Both false → tied to a specific student.
  isGeneral: boolean;
  tags: { id: string; label: string; color: string }[];
  subtasks: Subtask[];
  completionRequestedAt?: string | null;
  group?: { id: string; name: string; color: string } | null;
  dependsOnIds?: string[];
  createdAt?: string;
  updatedAt: string;
}

export interface Subtask {
  id: string;
  text: string;
  done: boolean;
  due?: string | null;
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
  students: {
    id: string;
    fullName: string;
    alias: string | null;
    color: string;
    avatarUrl: string | null;
    driveFolderId: string | null;
  }[];
  // Admin-configured team Drive folder id (or null). Surfaced in the
  // multi-root picker when a task is team-only / has no student.
  teamDriveFolderId?: string | null;
  teamMembers: Member[];
  filterStudent: string | null;
  openTicketId: string | null;
  autoOpenNew: boolean;
  viewerId: string;
  viewerRole: string;
  viewerStudentId: string | null;
  viewerTeamMembers: Member[];
  highlightByTicket: Record<string, "new" | "updated">;
  initialDeleted?: Ticket[];
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
  teamDriveFolderId,
  highlightByTicket: initialHighlights,
  initialDeleted = [],
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
  // "" = any · "__none__" = only ungrouped/individual · <id> = that group
  const [groupFilter, setGroupFilter] = useState<string>("");
  const [search, setSearch] = useState("");
  const [openId, setOpenId] = useState<string | null>(openTicketId);
  const [newOpen, setNewOpen] = useState(autoOpenNew);
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [hoverStatus, setHoverStatus] = useState<string | null>(null);
  const [view, setView] = useState<"board" | "list" | "gantt">("board");
  const [recentlyDeleted, setRecentlyDeleted] =
    useState<Ticket[]>(initialDeleted);
  const [undo, setUndo] = useState<Ticket | null>(null);
  const router = useRouter();
  useEffect(() => {
    if (!undo) return;
    const t = setTimeout(() => setUndo(null), 7000);
    return () => clearTimeout(t);
  }, [undo]);
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
      if (groupFilter === "__none__") {
        if (t.group) return false;
      } else if (groupFilter && t.group?.id !== groupFilter) {
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
  }, [tickets, studentFilter, priorityFilter, categoryFilter, groupFilter, search]);

  // Distinct groups present in the loaded tasks (optionally scoped to the
  // selected student), for the toolbar group filter.
  const groupOptions = useMemo(() => {
    const m = new Map<string, { id: string; name: string }>();
    for (const t of tickets) {
      if (!t.group) continue;
      if (studentFilter && t.student.id !== studentFilter) continue;
      m.set(t.group.id, { id: t.group.id, name: t.group.name });
    }
    return [...m.values()].sort((a, b) => a.name.localeCompare(b.name));
  }, [tickets, studentFilter]);

  const grouped = useMemo(() => {
    const m: Record<string, Ticket[]> = {};
    for (const s of STATUSES) m[s.id] = [];
    for (const t of filtered) (m[t.status] ??= []).push(t);
    return m;
  }, [filtered]);

  // Version-gated refetch. Subscribes to the kanban section version
  // published by /api/unread via UnreadProvider. The provider's single
  // poll drives freshness for the whole app; here we only do a full
  // /api/tickets/list fetch when the version moves (i.e. another user
  // actually did something). When nobody else is active, this useEffect
  // never fires its inner fetch.
  //
  // Self-changes don't bump the version (server filters actorId != me),
  // so the user's own optimistic state updates won't ricochet into
  // spurious refetches.
  const kanbanVersion = useSectionVersion("kanban");
  const lastSeenVersionRef = useRef<string | null>(null);

  async function fetchTickets() {
    // Skip while dragging or while a dialog is open to avoid yanking
    // state mid-interaction.
    if (draggingId || newOpen || openId) return;
    try {
      // Always fetch the FULL visible set — the student filter is
      // applied client-side. Scoping the fetch by student made
      // switching filters show nothing until the next refetch.
      const r = await fetch(`/api/tickets/list`, { cache: "no-store" });
      if (!r.ok) return;
      const j = await r.json();
      setTickets((prev) => {
        const newIds = new Set<string>(j.tickets.map((t: Ticket) => t.id));
        const gone = prev.filter((t) => !newIds.has(t.id));
        if (gone.length > 0) {
          setRecentlyDeleted((rd) => {
            const have = new Set(rd.map((t) => t.id));
            return [...rd, ...gone.filter((t) => !have.has(t.id))];
          });
        }
        return j.tickets;
      });
      setHighlightByTicket(j.highlightByTicket ?? {});
    } catch {
      // ignore transient network errors
    }
  }

  // Refetch whenever the kanban version moves (peer activity). The
  // very first version we see is treated as the baseline — we don't
  // refetch immediately on mount because the SSR'd initial tickets
  // already reflect that snapshot.
  useEffect(() => {
    if (kanbanVersion === null) return;
    if (lastSeenVersionRef.current === null) {
      lastSeenVersionRef.current = kanbanVersion;
      return;
    }
    if (lastSeenVersionRef.current === kanbanVersion) return;
    lastSeenVersionRef.current = kanbanVersion;
    fetchTickets();
    // fetchTickets reads draggingId/newOpen/openId at call time but
    // we intentionally only re-trigger on version changes here.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [kanbanVersion]);

  // Safety backstop: a full refresh every 5 minutes catches any drift
  // if a change escaped the version aggregate (or was masked by
  // dismissal logic). Cheap — 12 fetches/hour vs. the previous 450.
  useEffect(() => {
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | null = null;
    function schedule() {
      if (cancelled) return;
      timer = setTimeout(async () => {
        if (
          typeof document === "undefined" ||
          document.visibilityState !== "hidden"
        ) {
          await fetchTickets();
        }
        schedule();
      }, 5 * 60_000);
    }
    schedule();
    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function requestCompletion(id: string) {
    setTickets((prev) =>
      prev.map((t) =>
        t.id === id
          ? { ...t, completionRequestedAt: new Date().toISOString() }
          : t,
      ),
    );
    const res = await fetch(`/api/tickets/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ requestCompletion: true }),
    });
    if (!res.ok) router.refresh();
  }

  async function moveTicket(id: string, status: string) {
    // Students can't move a task to Done — the gesture is treated as
    // "Mark as completed" (a supervisor then confirms it Done).
    if (status === "done" && isStudent) {
      await requestCompletion(id);
      return;
    }
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

  async function refetchTickets() {
    try {
      // Full visible set; the student filter is applied client-side.
      const r = await fetch(`/api/tickets/list`, { cache: "no-store" });
      if (r.ok) {
        const j = await r.json();
        setTickets(j.tickets);
      }
    } catch {
      /* ignore — the 8s poll will catch up */
    }
  }

  const openTicket = tickets.find((t) => t.id === openId) ?? null;

  return (
    <div className="flex flex-col h-[calc(100vh-4rem)] w-full min-w-0">
      <div className="px-6 lg:px-8 py-4 border-b bg-white space-y-3">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h1 className="text-2xl font-bold text-slate-900">Tasks</h1>
            <p className="text-sm text-slate-500 mt-1">
              {filtered.length} of {tickets.length} task
              {tickets.length === 1 ? "" : "s"}
            </p>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <div className="flex rounded-lg border bg-slate-50 p-0.5">
              {(["board", "list", "gantt"] as const).map((v) => (
                <button
                  key={v}
                  type="button"
                  onClick={() => setView(v)}
                  className={cn(
                    "px-3 py-1 text-xs font-semibold rounded-md transition-colors capitalize",
                    view === v
                      ? "bg-white text-slate-900 shadow-sm"
                      : "text-slate-500 hover:text-slate-700",
                  )}
                >
                  {v}
                </button>
              ))}
            </div>
            <Button variant="brand" onClick={() => setNewOpen(true)}>
              <Plus className="h-4 w-4" /> New task
            </Button>
          </div>
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
          {!isStudent && (
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
          )}
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
          <Select
            value={groupFilter}
            onChange={(e) => setGroupFilter(e.target.value)}
            className="!w-auto grow-0 basis-40 max-w-[12rem]"
            title="Filter by task group"
          >
            <option value="">Any group</option>
            <option value="__none__">Individual (no group)</option>
            {groupOptions.map((g) => (
              <option key={g.id} value={g.id}>
                {g.name}
              </option>
            ))}
          </Select>
        </div>
      </div>

      {view === "list" ? (
        <TaskListView
          tickets={filtered}
          students={students}
          onOpen={(id) => setOpenId(id)}
          onMutated={refetchTickets}
        />
      ) : view === "gantt" ? (
        <GanttView
          tickets={filtered}
          students={students}
          onOpen={(id) => setOpenId(id)}
        />
      ) : (
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
                {recentlyDeleted
                  .filter(
                    (t) =>
                      t.status === col.id &&
                      (!studentFilter || t.student.id === studentFilter),
                  )
                  .map((t) => (
                    <GhostTaskCard
                      key={`deleted-${t.id}`}
                      ticket={t}
                      onDismiss={() =>
                        setRecentlyDeleted((prev) =>
                          prev.filter((r) => r.id !== t.id),
                        )
                      }
                    />
                  ))}
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
      )}

      <NewTicketDialog
        open={newOpen}
        onOpenChange={setNewOpen}
        students={students}
        tickets={tickets}
        teamMembers={teamMembers}
        assigneeOptions={assigneeOptions}
        defaultStudentId={
          isStudent && viewerStudentId
            ? viewerStudentId
            : studentFilter || null
        }
        isStudent={isStudent}
        viewerId={viewerId}
        teamDriveFolderId={teamDriveFolderId ?? null}
        onCreated={(t) => {
          setTickets((prev) => [t, ...prev]);
          setNewOpen(false);
          setOpenId(t.id);
        }}
      />

      <TicketDetailDialog
        ticket={openTicket}
        open={!!openTicket}
        isStudent={isStudent}
        allTickets={tickets}
        onOpenChange={(o) => !o && setOpenId(null)}
        students={students}
        teamMembers={assigneeOptions}
        teamDriveFolderId={teamDriveFolderId ?? null}
        onChange={(updated) => {
          setTickets((prev) => prev.map((t) => (t.id === updated.id ? updated : t)));
        }}
        onDeleted={(id) => {
          const gone = tickets.find((t) => t.id === id);
          setTickets((prev) => prev.filter((t) => t.id !== id));
          setOpenId(null);
          if (gone) setUndo(gone);
        }}
      />

      {undo && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 flex items-center gap-3 rounded-xl bg-slate-900 px-4 py-2.5 text-sm text-white shadow-lg">
          <span className="truncate max-w-[40vw]">
            Task deleted: “{undo.title}”
          </span>
          <button
            type="button"
            onClick={() => {
              const u = undo;
              setUndo(null);
              // Optimistic: re-add the card instantly. The restore API (which
              // also re-syncs the Google Calendar event) runs in the
              // background — no await, no full page refresh, so it's instant.
              setTickets((prev) =>
                prev.some((t) => t.id === u.id) ? prev : [u, ...prev],
              );
              fetch(`/api/tickets/${u.id}/restore`, { method: "POST" }).catch(
                () => {},
              );
            }}
            className="font-semibold text-[var(--c-orange)] hover:underline"
          >
            Undo
          </button>
          <button
            type="button"
            onClick={() => setUndo(null)}
            className="text-slate-400 hover:text-white"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      )}
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
            {CATEGORIES.find((c) => c.id === ticket.category)?.label ??
              ticket.category}
          </Badge>
          {ticket.group && (
            <Badge
              color={highlight ? "#ffffff" : ticket.group.color}
              variant={highlight ? "outline" : "soft"}
              title={`Group: ${ticket.group.name}`}
            >
              ▦ {ticket.group.name}
            </Badge>
          )}
          {ticket.completionRequestedAt && ticket.status !== "done" && (
            <Badge
              color={highlight ? "#ffffff" : "#f59e0b"}
              variant={highlight ? "outline" : "soft"}
              title="The student marked this completed — a supervisor confirms it Done"
            >
              ✓ completion requested
            </Badge>
          )}
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
            {ticket.linkedEventCount > 0 && (
              <span
                className="flex items-center gap-0.5"
                title={`${ticket.linkedEventCount} related event${
                  ticket.linkedEventCount === 1 ? "" : "s"
                } — open the task for details`}
              >
                <CalendarClock className="h-3 w-3" /> {ticket.linkedEventCount}
              </span>
            )}
            {ticket.driveFolderUrl && (
              <a
                href={ticket.driveFolderUrl}
                target="_blank"
                rel="noopener"
                onClick={(e) => e.stopPropagation()}
                title="Open Drive folder"
                className="flex items-center hover:text-[var(--c-blue)]"
              >
                <FolderOpen className="h-3 w-3" />
              </a>
            )}
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
  tickets,
  teamMembers,
  assigneeOptions,
  defaultStudentId,
  isStudent,
  viewerId,
  teamDriveFolderId,
  onCreated,
}: {
  open: boolean;
  onOpenChange: (b: boolean) => void;
  students: Props["students"];
  tickets: Ticket[];
  teamDriveFolderId?: string | null;
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
  const [studentId, setStudentId] = useState<string>(defaultStudentId ?? "");
  const [deps, setDeps] = useState<string[]>([]);
  const [driveFolderUrl, setDriveFolderUrl] = useState<string | null>(null);
  // "" = no group · "__new__" = create one named newGroupName · <id> = existing
  const [groupId, setGroupId] = useState<string>("");
  const [newGroupName, setNewGroupName] = useState<string>("");
  // Tasks always have a student. The picker no longer surfaces the
  // team-only/general sentinels — every task is bound to a student.
  const effStudentId = isStudent ? defaultStudentId : studentId || null;
  // Existing groups for the chosen student (groups are per-student).
  const studentGroups = (() => {
    const m = new Map<string, { id: string; name: string; color: string }>();
    for (const t of tickets)
      if (t.group && effStudentId && t.student.id === effStudentId)
        m.set(t.group.id, t.group);
    return [...m.values()].sort((a, b) => a.name.localeCompare(b.name));
  })();

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
      body: JSON.stringify({
        ...payload,
        dependsOnIds: deps,
        driveFolderUrl,
        // Assign to an existing group inline; a brand-new group is created
        // right after (it needs the new task's id).
        groupId: groupId && groupId !== "__new__" ? groupId : null,
      }),
    });
    if (!res.ok) {
      setSubmitting(false);
      const j = await res.json().catch(() => ({}));
      setError(j.error ?? "Could not create task");
      return;
    }
    const { ticket } = await res.json();
    if (groupId === "__new__" && newGroupName.trim()) {
      const gr = await fetch("/api/task-groups", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: newGroupName.trim(),
          ticketIds: [ticket.id],
        }),
      });
      if (gr.ok) {
        const gj = await gr.json().catch(() => ({}));
        if (gj?.group?.id)
          ticket.group = {
            id: gj.group.id,
            name: gj.group.name,
            color: "#6366f1",
          };
      }
    }
    setSubmitting(false);
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
                <Select
                  name="studentId"
                  value={studentId}
                  onChange={(e) => {
                    setStudentId(e.target.value);
                    setDeps([]);
                    setGroupId("");
                    setNewGroupName("");
                  }}
                  required
                >
                  <option value="" disabled>Select…</option>
                  {/* Tasks are always student-specific (per product
                      decision). Team-only / general are reserved for
                      calendar events. */}
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
          <Field label="Drive folder (optional)">
            {(() => {
              // Tasks are always student-scoped — Drive picker is always
              // rooted at that student's folder (no multi-root chooser).
              const stu = effStudentId
                ? students.find((s) => s.id === effStudentId)
                : null;
              return (
                <DriveFolderField
                  value={driveFolderUrl}
                  onChange={setDriveFolderUrl}
                  studentFolderId={stu?.driveFolderId ?? null}
                  studentFolderName={
                    stu ? displayName(stu) + " · Drive" : null
                  }
                />
              );
            })()}
          </Field>
          <Field label="Group (optional)">
            {effStudentId ? (
              <>
                <Select
                  value={groupId}
                  onChange={(e) => setGroupId(e.target.value)}
                >
                  <option value="">No group</option>
                  {studentGroups.map((g) => (
                    <option key={g.id} value={g.id}>
                      {g.name}
                    </option>
                  ))}
                  <option value="__new__">+ Create new group…</option>
                </Select>
                {groupId === "__new__" && (
                  <Input
                    value={newGroupName}
                    onChange={(e) => setNewGroupName(e.target.value)}
                    placeholder="New group name"
                    className="mt-1.5"
                  />
                )}
              </>
            ) : (
              <p className="text-xs text-slate-400">Pick a student first.</p>
            )}
          </Field>
          <Field label="Depends on (optional)">
            <DependencyPicker
              tickets={tickets}
              studentId={effStudentId}
              value={deps}
              onChange={setDeps}
            />
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
  isStudent,
  allTickets,
  students,
  onOpenChange,
  teamMembers,
  teamDriveFolderId,
  onChange,
  onDeleted,
}: {
  ticket: Ticket | null;
  open: boolean;
  isStudent: boolean;
  allTickets: Ticket[];
  onOpenChange: (b: boolean) => void;
  students: Props["students"];
  teamMembers: Member[];
  teamDriveFolderId?: string | null;
  onChange: (t: Ticket) => void;
  onDeleted: (id: string) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [customCategory, setCustomCategory] = useState<string>("");
  const [err, setErr] = useState<string | null>(null);
  useEffect(() => {
    if (!ticket) return;
    setErr(null);
    setCustomCategory(
      isOtherCategory(ticket.category) && ticket.category !== "other"
        ? ticket.category
        : "",
    );
  }, [ticket?.id, ticket?.category]);
  // Debounce timer for text fields so we save changes without one PATCH per keystroke.
  const debounceTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  function debouncedSave(patch: Partial<Ticket> & { dueDate?: string | null; requestCompletion?: boolean; dependsOnIds?: string[] }) {
    if (debounceTimer.current) clearTimeout(debounceTimer.current);
    debounceTimer.current = setTimeout(() => {
      // ticket may have been closed/changed in the meantime; check before calling
      update(patch);
    }, 600);
  }
  if (!ticket) return null;

  async function update(patch: Partial<Ticket> & { dueDate?: string | null; requestCompletion?: boolean; dependsOnIds?: string[] }) {
    if (!ticket) return;
    // A sub-task deadline can't fall after the task's own deadline. Validate
    // the effective state before sending so the user gets an immediate error
    // and the bad value is never persisted (server enforces this too).
    if (patch.subtasks !== undefined || patch.dueDate !== undefined) {
      const nextSubtasks =
        patch.subtasks !== undefined ? patch.subtasks : ticket.subtasks;
      const nextDue =
        patch.dueDate !== undefined ? patch.dueDate : ticket.dueDate;
      const violation = subtaskDueViolation(nextSubtasks, nextDue ?? null);
      if (violation) {
        setErr(violation);
        return;
      }
    }
    setErr(null);
    const optimistic = { ...ticket, ...patch } as Ticket;
    onChange(optimistic);
    const res = await fetch(`/api/tickets/${ticket.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(patch),
    });
    if (!res.ok) {
      const j = await res.json().catch(() => ({}));
      setErr(j.error ?? "Could not save changes.");
    }
  }

  // Assign this task to an existing group (or null = remove from group).
  async function setGroupTo(
    g: { id: string; name: string; color: string } | null,
  ) {
    if (!ticket) return;
    setErr(null);
    onChange({ ...ticket, group: g });
    const res = await fetch(`/api/tickets/${ticket.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ groupId: g?.id ?? null }),
    });
    if (!res.ok) {
      const j = await res.json().catch(() => ({}));
      setErr(j.error ?? "Could not change the group.");
    }
  }

  // Create a brand-new group containing this task.
  async function createGroupWith(name: string) {
    if (!ticket) return;
    setErr(null);
    const res = await fetch(`/api/task-groups`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, ticketIds: [ticket.id] }),
    });
    if (!res.ok) {
      const j = await res.json().catch(() => ({}));
      setErr(j.error ?? "Could not create the group.");
      return;
    }
    const j = await res.json().catch(() => ({}));
    if (j?.group?.id)
      onChange({
        ...ticket,
        group: { id: j.group.id, name: j.group.name, color: "#6366f1" },
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

        {err && (
          <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-[var(--c-red)]">
            {err}
          </div>
        )}

        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <Field label="Status">
              <Select
                value={ticket.status}
                onChange={(e) => update({ status: e.target.value })}
              >
                {STATUSES.filter(
                  (s) =>
                    !isStudent || s.id !== "done" || ticket.status === "done",
                ).map((s) => (
                  <option key={s.id} value={s.id}>{s.label}</option>
                ))}
              </Select>
              {ticket.status !== "done" &&
                (ticket.completionRequestedAt ? (
                  <p
                    className={cn(
                      "mt-1.5 rounded-md px-2 py-1 text-[11px]",
                      isStudent
                        ? "bg-slate-100 text-slate-500"
                        : "bg-amber-50 text-amber-700 font-medium",
                    )}
                  >
                    {isStudent
                      ? "✓ Sent to your supervisor — awaiting Done"
                      : "Student marked this completed — set status to Done to confirm"}
                  </p>
                ) : (
                  isStudent && (
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="mt-1.5 w-full"
                      onClick={() =>
                        update({
                          requestCompletion: true,
                          completionRequestedAt: new Date().toISOString(),
                        })
                      }
                    >
                      Mark as completed
                    </Button>
                  )
                ))}
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
          </div>

          <Field label="Drive folder">
            {(() => {
              // Tasks are always student-scoped → root the picker at that
              // student's Drive folder.
              const stu = students.find((s) => s.id === ticket.student.id);
              return (
                <DriveFolderField
                  value={ticket.driveFolderUrl ?? null}
                  onChange={(url) => update({ driveFolderUrl: url })}
                  studentFolderId={stu?.driveFolderId ?? null}
                  studentFolderName={
                    stu ? displayName(stu) + " · Drive" : null
                  }
                />
              );
            })()}
          </Field>

          <LinksSection
            initialLinks={ticket.links ?? []}
            save={async (next) => {
              await fetch(`/api/tickets/${ticket.id}`, {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ links: next }),
              });
              update({ links: next } as Partial<Ticket>);
            }}
          />

          {(() => {
            // Existing groups for this task's student (derived from the
            // loaded tasks — groups are per-student).
            const m = new Map<
              string,
              { id: string; name: string; color: string }
            >();
            for (const tk of allTickets)
              if (tk.group && tk.student.id === ticket.student.id)
                m.set(tk.group.id, tk.group);
            const studentGroups = [...m.values()].sort((a, b) =>
              a.name.localeCompare(b.name),
            );
            return (
              <Field label="Group">
                <Select
                  value={ticket.group?.id ?? ""}
                  onChange={(e) => {
                    const v = e.target.value;
                    if (v === "") {
                      setGroupTo(null);
                    } else if (v === "__new__") {
                      const name = window
                        .prompt("New group name")
                        ?.trim();
                      if (name) createGroupWith(name);
                    } else {
                      const g = studentGroups.find((x) => x.id === v);
                      if (g) setGroupTo(g);
                    }
                  }}
                >
                  <option value="">No group</option>
                  {studentGroups.map((g) => (
                    <option key={g.id} value={g.id}>
                      {g.name}
                    </option>
                  ))}
                  <option value="__new__">+ Create new group…</option>
                </Select>
                <p className="mt-1 text-[11px] text-slate-400">
                  Collect this student&apos;s related tasks under a named
                  group. Manage groups (rename / disband) from the{" "}
                  <b>List</b> view.
                </p>
              </Field>
            );
          })()}

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
            taskDue={ticket.dueDate}
            onChange={(next) => update({ subtasks: next } as Partial<Ticket>)}
          />

          <Field label="Depends on">
            <DependencyPicker
              tickets={allTickets}
              studentId={ticket.student.id}
              selfId={ticket.id}
              value={ticket.dependsOnIds ?? []}
              onChange={(next) => update({ dependsOnIds: next })}
            />
          </Field>

          {ticket.linkedEvents && ticket.linkedEvents.length > 0 && (
            <div>
              <div className="text-xs font-semibold uppercase text-slate-500 mb-2">
                Related events ({ticket.linkedEvents.length})
              </div>
              <ul className="space-y-1.5">
                {ticket.linkedEvents.map((e) => (
                  <li
                    key={e.id}
                    className="flex items-center gap-2 rounded-md border bg-slate-50 px-2.5 py-1.5 text-sm"
                  >
                    <CalendarClock className="h-3.5 w-3.5 shrink-0 text-[var(--c-teal)]" />
                    <Link
                      href="/calendar"
                      className="min-w-0 flex-1 truncate text-slate-800 hover:text-[var(--c-violet)]"
                    >
                      {e.title}
                    </Link>
                    <span className="shrink-0 text-[11px] text-slate-500">
                      {new Date(e.startsAt).toLocaleString(undefined, {
                        month: "short",
                        day: "numeric",
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                    </span>
                  </li>
                ))}
              </ul>
              <p className="mt-1.5 text-[11px] text-slate-400">
                Linked from the Calendar (event → ‘Related task’).
              </p>
            </div>
          )}

          <CommentsThread
            apiBase={`/api/tickets/${ticket.id}/comments`}
            initialCount={ticket.commentCount}
          />

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

function DependencyPicker({
  tickets,
  studentId,
  selfId,
  value,
  onChange,
}: {
  tickets: Ticket[];
  studentId: string | null;
  selfId?: string;
  value: string[];
  onChange: (next: string[]) => void;
}) {
  const candidates = tickets.filter(
    (t) => t.student.id === studentId && t.id !== selfId,
  );
  const byId = new Map(candidates.map((t) => [t.id, t]));
  const selected = value
    .map((id) => byId.get(id))
    .filter((t): t is Ticket => !!t);
  const available = candidates.filter((t) => !value.includes(t.id));

  function add(id: string) {
    if (id && !value.includes(id)) onChange([...value, id]);
  }
  function remove(id: string) {
    onChange(value.filter((x) => x !== id));
  }

  if (!studentId) {
    return <p className="text-xs text-slate-400">Pick a student first.</p>;
  }
  if (candidates.length === 0) {
    return (
      <p className="text-xs text-slate-400">
        No other tasks for this student yet.
      </p>
    );
  }
  return (
    <div className="space-y-2">
      <Select
        value=""
        onChange={(e) => {
          add(e.target.value);
          e.target.value = "";
        }}
      >
        <option value="">
          {available.length === 0
            ? "All tasks already selected"
            : "Add a parent task…"}
        </option>
        {available.map((t) => (
          <option key={t.id} value={t.id}>
            {t.title} ·{" "}
            {STATUSES.find((s) => s.id === t.status)?.label ?? t.status}
          </option>
        ))}
      </Select>

      {selected.length > 0 && (
        <ul className="flex flex-wrap gap-1.5">
          {selected.map((t) => (
            <li
              key={t.id}
              className="flex items-center gap-1.5 rounded-full border bg-slate-50 py-1 pl-2.5 pr-1 text-xs"
            >
              <span
                className="h-1.5 w-1.5 rounded-full"
                style={{ background: statusColor(t.status) }}
              />
              <span className="max-w-[14rem] truncate">{t.title}</span>
              <button
                type="button"
                onClick={() => remove(t.id)}
                className="flex h-4 w-4 items-center justify-center rounded-full text-slate-400 hover:bg-slate-200 hover:text-slate-700"
                title="Remove dependency"
                aria-label={`Remove ${t.title}`}
              >
                <X className="h-3 w-3" />
              </button>
            </li>
          ))}
        </ul>
      )}

      <p className="text-[11px] text-slate-400">
        The task stays <b>Blocked</b> until every selected task is{" "}
        <b>Done</b>, then it auto-moves to <b>To do</b>.
      </p>
    </div>
  );
}

// Drive-folder field: a picker (browse Google Drive) plus an "Open" button
// when a folder is linked. Tickets store the full folder URL; the shared
// DriveFolderPicker speaks folder-IDs, so we adapt between the two.
const DRIVE_FOLDER_RE = /\/folders\/([a-zA-Z0-9_-]+)/;
function driveUrlToId(url: string | null | undefined): string | null {
  if (!url) return null;
  const m = url.match(DRIVE_FOLDER_RE);
  return m ? m[1] : null;
}
function DriveFolderField({
  value,
  onChange,
  studentFolderId,
  studentFolderName,
  roots,
}: {
  value: string | null;
  onChange: (url: string | null) => void;
  // When the parent task belongs to a specific student, root the picker
  // at that student's Drive folder so users don't have to navigate from
  // "My Drive" each time. Null/undefined → original free-browse mode.
  studentFolderId?: string | null;
  studentFolderName?: string | null;
  // Multi-root chooser for team-only items (no student). When set, the
  // picker shows a list of student folders + the team folder and never
  // exposes "My Drive".
  roots?: import("@/components/drive-folder-picker").PickerRoot[];
}) {
  const id = driveUrlToId(value);
  // Resolve the folder's display name from its ID so the picker shows the
  // name, not the raw ID. Derived (not sync setState) to stay lint-clean.
  const [resolved, setResolved] = useState<{ id: string; name: string } | null>(
    null,
  );
  useEffect(() => {
    if (!id) return;
    let cancelled = false;
    fetch(`/api/drive/folder?id=${encodeURIComponent(id)}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => {
        if (!cancelled && j?.name) setResolved({ id, name: j.name });
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [id]);
  const valueName = resolved && resolved.id === id ? resolved.name : null;
  return (
    <div className="space-y-2">
      {value && (
        <a
          href={value}
          target="_blank"
          rel="noopener"
          className="inline-flex items-center gap-1.5 rounded-lg border bg-slate-50 px-3 py-1.5 text-sm font-medium text-[var(--c-blue)] hover:bg-slate-100"
        >
          <FolderOpen className="h-4 w-4" /> Open Drive folder
        </a>
      )}
      <DriveFolderPicker
        value={id}
        valueName={valueName}
        onChange={(folderId) =>
          onChange(
            folderId
              ? `https://drive.google.com/drive/folders/${folderId}`
              : null,
          )
        }
        triggerLabel={value ? "Change folder" : "Pick from Drive"}
        rootFolderId={studentFolderId ?? null}
        rootFolderName={studentFolderName ?? null}
        roots={roots}
      />
    </div>
  );
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
  taskDue,
  onChange,
}: {
  subtasks: Subtask[];
  taskDue: string | null;
  onChange: (next: Subtask[]) => void;
}) {
  const [draft, setDraft] = useState("");
  const done = subtasks.filter((s) => s.done).length;
  const maxDue = taskDue ? taskDue.slice(0, 10) : undefined;

  function toggle(id: string) {
    onChange(subtasks.map((s) => (s.id === id ? { ...s, done: !s.done } : s)));
  }
  function remove(id: string) {
    onChange(subtasks.filter((s) => s.id !== id));
  }
  function rename(id: string, text: string) {
    onChange(subtasks.map((s) => (s.id === id ? { ...s, text } : s)));
  }
  function setDue(id: string, due: string) {
    onChange(
      subtasks.map((s) => (s.id === id ? { ...s, due: due || null } : s)),
    );
  }
  function add() {
    const text = draft.trim();
    if (!text) return;
    onChange([
      ...subtasks,
      { id: nanoid(8), text, done: false, due: null },
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
                  "flex-1 min-w-0 bg-transparent text-sm focus:outline-none focus:bg-slate-50 rounded px-1",
                  s.done && "line-through text-slate-400",
                )}
              />
              <input
                type="date"
                value={s.due ? s.due.slice(0, 10) : ""}
                max={maxDue}
                onChange={(e) => setDue(s.id, e.target.value)}
                title={
                  maxDue
                    ? `Deadline (on or before the task's ${maxDue})`
                    : "Deadline (optional)"
                }
                className="h-7 w-[8.5rem] shrink-0 rounded-md border bg-white px-1.5 text-xs text-slate-600 focus:outline-none focus:ring-2 focus:ring-[var(--ring)]/20"
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

function GhostTaskCard({
  ticket,
  onDismiss,
}: {
  ticket: Ticket;
  onDismiss: () => void;
}) {
  return (
    <div
      className="relative rounded-xl border-2 border-dashed bg-slate-50 p-3 opacity-80"
      style={{ borderColor: "var(--c-red)" }}
    >
      <button
        type="button"
        onClick={onDismiss}
        title="Dismiss"
        className="absolute right-2 top-2 rounded-md p-1 text-slate-400 hover:bg-white hover:text-slate-700"
      >
        <X className="h-3.5 w-3.5" />
      </button>
      <div className="flex items-center gap-1.5 mb-1">
        <span
          className="rounded-sm px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide text-white"
          style={{ background: "var(--c-red)" }}
        >
          Deleted
        </span>
        <span className="text-[10px] text-slate-500">
          {displayName(ticket.student)}
        </span>
      </div>
      <div className="text-sm font-medium text-slate-700 line-through pr-6">
        {ticket.title}
      </div>
    </div>
  );
}

function TaskListView({
  tickets,
  students,
  onOpen,
  onMutated,
}: {
  tickets: Ticket[];
  students: Props["students"];
  onOpen: (id: string) => void;
  onMutated: () => void;
}) {
  const [selected, setSelected] = useState<string[]>([]);
  const [groupName, setGroupName] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const byStudent = useMemo(() => {
    const m: Record<string, Ticket[]> = {};
    for (const t of tickets) (m[t.student.id] ??= []).push(t);
    return students
      .map((s) => ({ student: s, tickets: m[s.id] ?? [] }))
      .filter((g) => g.tickets.length > 0);
  }, [tickets, students]);

  const selSet = new Set(selected);
  const selTickets = tickets.filter((t) => selSet.has(t.id));
  const selStudentIds = [...new Set(selTickets.map((t) => t.student.id))];
  const sameStudent = selStudentIds.length === 1;
  // Existing groups belonging to the selected tasks' student (so the
  // selection can be added to one of them, not only to a brand-new group).
  const groupChoices = sameStudent
    ? [
        ...new Map(
          tickets
            .filter(
              (t) => t.student.id === selStudentIds[0] && t.group,
            )
            .map((t) => [t.group!.id, t.group!]),
        ).values(),
      ].sort((a, b) => a.name.localeCompare(b.name))
    : [];

  function toggle(id: string) {
    setSelected((p) =>
      p.includes(id) ? p.filter((x) => x !== id) : [...p, id],
    );
  }

  async function createGroup() {
    const name = groupName.trim();
    if (!name || selected.length === 0) return;
    setBusy(true);
    setErr(null);
    const r = await fetch("/api/task-groups", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, ticketIds: selected }),
    });
    setBusy(false);
    if (!r.ok) {
      const j = await r.json().catch(() => ({}));
      setErr(j.error ?? "Could not create the group.");
      return;
    }
    setSelected([]);
    setGroupName("");
    onMutated();
  }

  // Add the currently-selected tasks to an already-existing group.
  async function addSelectedToGroup(groupId: string) {
    if (!groupId || selected.length === 0) return;
    setBusy(true);
    setErr(null);
    const results = await Promise.all(
      selected.map((id) =>
        fetch(`/api/tickets/${id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ groupId }),
        }),
      ),
    );
    setBusy(false);
    if (results.some((r) => !r.ok)) {
      setErr("Some tasks couldn't be added to the group.");
    }
    setSelected([]);
    onMutated();
  }

  async function renameGroup(id: string, current: string) {
    const name = window.prompt("Rename group", current);
    if (!name || name.trim() === current) return;
    await fetch(`/api/task-groups/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: name.trim() }),
    });
    onMutated();
  }
  async function disbandGroup(id: string) {
    if (!window.confirm("Disband this group? The tasks stay, just ungrouped."))
      return;
    await fetch(`/api/task-groups/${id}`, { method: "DELETE" });
    onMutated();
  }
  async function removeFromGroup(ticketId: string) {
    await fetch(`/api/tickets/${ticketId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ groupId: null }),
    });
    onMutated();
  }

  if (byStudent.length === 0) {
    return (
      <div className="flex-1 flex items-center justify-center text-sm text-slate-400">
        No tasks match the current filters.
      </div>
    );
  }

  const COLS = 6;

  function Row({ t, accent }: { t: Ticket; accent?: string }) {
    const due = t.dueDate ? new Date(t.dueDate) : null;
    const overdue = due && isBefore(due, new Date()) && t.status !== "done";
    const checked = selSet.has(t.id);
    return (
      <>
        <tr
          onClick={() => onOpen(t.id)}
          className={cn(
            "cursor-pointer hover:bg-slate-50",
            checked && "bg-violet-50/60",
          )}
        >
          <td
            className="px-2 py-2 w-8"
            onClick={(e) => e.stopPropagation()}
            // Colored left bar ties a row to its group block above;
            // ungrouped rows get a transparent bar so text stays aligned.
            style={{
              borderLeft: `3px solid ${accent ?? "transparent"}`,
            }}
          >
            <input
              type="checkbox"
              checked={checked}
              onChange={() => toggle(t.id)}
              className="h-4 w-4 rounded border-slate-300"
              aria-label="Select task"
            />
          </td>
          <td className="px-3 py-2">
            <div className="flex items-center gap-2 min-w-0 flex-wrap">
              <span className="font-medium text-slate-900 truncate">
                {t.title}
              </span>
              {t.commentCount > 0 && (
                <span
                  className="flex shrink-0 items-center gap-0.5 text-[11px] text-slate-400"
                  title={`${t.commentCount} comment${
                    t.commentCount === 1 ? "" : "s"
                  }`}
                >
                  <MessageSquare className="h-3 w-3" /> {t.commentCount}
                </span>
              )}
              {t.linkedEventCount > 0 && (
                <span
                  className="flex shrink-0 items-center gap-0.5 text-[11px] font-medium text-[var(--c-teal)]"
                  title={
                    t.linkedEvents && t.linkedEvents.length > 0
                      ? `Related events:\n${t.linkedEvents
                          .map(
                            (e) =>
                              `• ${e.title} — ${new Date(
                                e.startsAt,
                              ).toLocaleString(undefined, {
                                month: "short",
                                day: "numeric",
                                hour: "2-digit",
                                minute: "2-digit",
                              })}`,
                          )
                          .join("\n")}`
                      : `${t.linkedEventCount} related event${
                          t.linkedEventCount === 1 ? "" : "s"
                        }`
                  }
                >
                  <CalendarClock className="h-3 w-3" /> {t.linkedEventCount}
                </span>
              )}
              {t.group && (
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    removeFromGroup(t.id);
                  }}
                  className="shrink-0 text-[10px] text-slate-400 hover:text-[var(--c-red)]"
                  title={`Remove from “${t.group.name}”`}
                >
                  ungroup
                </button>
              )}
            </div>
            {t.subtasks.length > 0 && (
              <ul className="mt-1 space-y-0.5">
                {t.subtasks.map((s) => (
                  <li
                    key={s.id}
                    className="flex items-center gap-1.5 text-[11px] text-slate-500 pl-3"
                  >
                    <span className="text-slate-400">{s.done ? "☑" : "☐"}</span>
                    <span className={s.done ? "line-through" : ""}>{s.text}</span>
                    {s.due && (
                      <span className="text-[10px] text-slate-400">
                        ·{" "}
                        {new Date(s.due + "T00:00:00").toLocaleDateString(
                          undefined,
                          { month: "short", day: "numeric" },
                        )}
                      </span>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </td>
          <td className="px-3 py-2">
            <Badge color={statusColor(t.status)}>
              {STATUSES.find((s) => s.id === t.status)?.label ?? t.status}
            </Badge>
          </td>
          <td className="px-3 py-2">
            <Badge color={priorityColor(t.priority)} variant="solid">
              {t.priority[0]!.toUpperCase()}
            </Badge>
          </td>
          <td className="px-3 py-2">
            <Badge color={categoryColor(t.category)}>
              {CATEGORIES.find((c) => c.id === t.category)?.label ??
                t.category}
            </Badge>
          </td>
          <td className="px-3 py-2">
            {t.assignee ? (
              <div className="flex items-center gap-1.5">
                <Avatar
                  name={t.assignee.name}
                  src={t.assignee.image}
                  color={t.assignee.color}
                  size="xs"
                />
                <span className="truncate text-xs text-slate-700">
                  {t.assignee.name}
                </span>
              </div>
            ) : (
              <span className="text-xs text-slate-400">Unassigned</span>
            )}
          </td>
          <td className="px-3 py-2">
            {due ? (
              <span
                className={cn(
                  "text-xs",
                  overdue
                    ? "text-[var(--c-red)] font-semibold"
                    : "text-slate-600",
                )}
              >
                {isToday(due)
                  ? "Today"
                  : isTomorrow(due)
                    ? "Tomorrow"
                    : format(due, "MMM d")}
              </span>
            ) : (
              <span className="text-xs text-slate-300">—</span>
            )}
          </td>
        </tr>
      </>
    );
  }

  return (
    <div className="flex-1 min-w-0 overflow-auto p-6 lg:p-8 space-y-6">
      <p className="text-xs text-slate-500">
        <b>Groups:</b> tick the checkboxes on tasks of the same student, then
        type a name and <b>Create group</b> (or pick <b>Add to existing
        group</b>). You can also set a task&apos;s group from its detail panel
        (open a task → <b>Group</b>). On a group heading, <b>rename</b> or{" "}
        <b>disband</b> it. Use the <b>group filter</b> in the toolbar to show
        one group or only individual tasks.
      </p>
      {selected.length > 0 && (
        <div className="sticky top-0 z-10 -mt-2 mb-2 flex flex-wrap items-center gap-2 rounded-xl border bg-white px-3 py-2 shadow-sm">
          <span className="text-sm font-medium text-slate-700">
            {selected.length} selected
          </span>
          <Input
            value={groupName}
            onChange={(e) => setGroupName(e.target.value)}
            placeholder="New group name…"
            className="!h-8 !w-56"
          />
          <Button
            type="button"
            size="sm"
            variant="brand"
            disabled={busy || !groupName.trim() || !sameStudent}
            onClick={createGroup}
          >
            Create group
          </Button>
          {sameStudent && groupChoices.length > 0 && (
            <>
              <span className="text-xs text-slate-400">or</span>
              <Select
                value=""
                disabled={busy}
                onChange={(e) => {
                  if (e.target.value) addSelectedToGroup(e.target.value);
                }}
                className="!h-8 !w-auto"
                title="Add the selected tasks to an existing group"
              >
                <option value="">Add to existing group…</option>
                {groupChoices.map((g) => (
                  <option key={g.id} value={g.id}>
                    {g.name}
                  </option>
                ))}
              </Select>
            </>
          )}
          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={() => {
              setSelected([]);
              setErr(null);
            }}
          >
            Clear
          </Button>
          {!sameStudent && (
            <span className="text-xs text-[var(--c-red)]">
              Select tasks of a single student to group them.
            </span>
          )}
          {err && (
            <span className="text-xs text-[var(--c-red)]">{err}</span>
          )}
        </div>
      )}

      {byStudent.map((g) => {
        // Order within a student: each group block, then ungrouped tasks.
        const groupsMap = new Map<
          string,
          { group: NonNullable<Ticket["group"]>; tasks: Ticket[] }
        >();
        const ungrouped: Ticket[] = [];
        for (const t of g.tickets) {
          if (t.group) {
            const e = groupsMap.get(t.group.id);
            if (e) e.tasks.push(t);
            else groupsMap.set(t.group.id, { group: t.group, tasks: [t] });
          } else ungrouped.push(t);
        }
        const groupBlocks = [...groupsMap.values()].sort((a, b) =>
          a.group.name.localeCompare(b.group.name),
        );
        return (
          <section key={g.student.id} className="space-y-2">
            <div className="flex items-center gap-2">
              <span
                className="h-3 w-3 rounded-full"
                style={{ background: g.student.color }}
              />
              <h2 className="text-sm font-bold text-slate-900">
                {displayName(g.student)}
              </h2>
              <span className="text-xs text-slate-500">
                · {g.tickets.length} task{g.tickets.length === 1 ? "" : "s"}
              </span>
            </div>
            <div className="overflow-hidden rounded-xl border bg-white">
              <table className="w-full text-sm">
                <thead className="bg-slate-50 text-[10px] uppercase tracking-wide text-slate-500">
                  <tr>
                    <th className="px-2 py-2 w-8"></th>
                    <th className="px-3 py-2 text-left font-semibold">Task</th>
                    <th className="px-3 py-2 text-left font-semibold">Status</th>
                    <th className="px-3 py-2 text-left font-semibold">Priority</th>
                    <th className="px-3 py-2 text-left font-semibold">Category</th>
                    <th className="px-3 py-2 text-left font-semibold">Assignee</th>
                    <th className="px-3 py-2 text-left font-semibold">Due date</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {groupBlocks.map(({ group, tasks }) => (
                    <Fragment key={group.id}>
                      <tr className="bg-slate-50/80">
                        <td colSpan={COLS + 1} className="px-3 py-1.5">
                          <div className="flex items-center gap-2">
                            <span
                              className="h-2.5 w-2.5 rounded-sm"
                              style={{ background: group.color }}
                            />
                            <span className="text-xs font-bold text-slate-700">
                              {group.name}
                            </span>
                            <span className="text-[10px] text-slate-400">
                              · {tasks.length} task
                              {tasks.length === 1 ? "" : "s"}
                            </span>
                            <button
                              type="button"
                              onClick={() => renameGroup(group.id, group.name)}
                              className="ml-2 text-[10px] text-slate-400 hover:text-slate-700"
                            >
                              rename
                            </button>
                            <button
                              type="button"
                              onClick={() => disbandGroup(group.id)}
                              className="text-[10px] text-slate-400 hover:text-[var(--c-red)]"
                            >
                              disband
                            </button>
                          </div>
                        </td>
                      </tr>
                      {tasks.map((t) => (
                        <Row key={t.id} t={t} accent={group.color} />
                      ))}
                    </Fragment>
                  ))}
                  {/* Separate standalone tasks from the group blocks above
                      so the two are visually distinct (only needed when
                      both groups and individual tasks are present). */}
                  {groupBlocks.length > 0 && ungrouped.length > 0 && (
                    <tr className="bg-slate-50/80">
                      <td colSpan={COLS + 1} className="px-3 py-1.5">
                        <div className="flex items-center gap-2">
                          <span className="h-2.5 w-2.5 rounded-sm border border-slate-300 bg-white" />
                          <span className="text-xs font-bold text-slate-700">
                            Individual tasks
                          </span>
                          <span className="text-[10px] text-slate-400">
                            · {ungrouped.length} task
                            {ungrouped.length === 1 ? "" : "s"} not in a group
                          </span>
                        </div>
                      </td>
                    </tr>
                  )}
                  {ungrouped.map((t) => (
                    <Row key={t.id} t={t} />
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        );
      })}
    </div>
  );
}
