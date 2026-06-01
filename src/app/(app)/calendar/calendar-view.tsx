"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  addDays,
  addMonths,
  addWeeks,
  eachDayOfInterval,
  endOfMonth,
  endOfWeek,
  format,
  isSameDay,
  isSameMonth,
  startOfDay,
  startOfMonth,
  startOfWeek,
  subDays,
  subMonths,
  subWeeks,
} from "date-fns";
import { ChevronLeft, ChevronRight, Plus, RefreshCw, ExternalLink, MapPin, Video, Trash2, Clock, Users as UsersIcon, X as XIcon, KanbanSquare } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input, Select, Textarea } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { cn, displayName } from "@/lib/utils";
import {
  buildRRule,
  parseRRule,
  expandOccurrences,
  type RecurFreq,
} from "@/lib/recurrence";
import { PRIORITIES, CATEGORIES } from "@/lib/kanban-constants";
import { useRouter } from "next/navigation";
import { openCalendarUrl } from "@/components/google-calendar-picker";
import { useSectionVersion } from "@/components/app-shell/unread-provider";
import { TaskPeek } from "@/components/task-peek";
import { CommentsThread } from "@/components/comments-thread";
import { LinksSection } from "@/components/links-section";
import { parseLinks } from "@/lib/links";
import { DriveFolderPicker } from "@/components/drive-folder-picker";
import { FolderOpen } from "lucide-react";
import { CalendarShareButton } from "../students/[id]/calendar-share-button";
import { AlertCircle } from "lucide-react";

const TASK_PRIORITY_COLOR: Record<string, string> = {
  low: "#94a3b8",
  medium: "#2196f3",
  high: "#ff7a45",
  urgent: "#e2445c",
};
function taskPriorityColor(p: string | null): string {
  return (p && TASK_PRIORITY_COLOR[p]) || "#94a3b8";
}

interface Student {
  id: string;
  fullName: string;
  alias: string | null;
  color: string;
  calendarId: string | null;
  driveFolderId: string | null;
}
interface Event {
  id: string;
  title: string;
  description: string | null;
  location: string | null;
  startsAt: string;
  endsAt: string;
  meetingUrl: string | null;
  recurrenceRule: string | null;
  isMeeting?: boolean;
  agenda?: string | null;
  meetingNotes?: string | null;
  student: { id: string; fullName: string; alias: string | null; color: string } | null;
  googleEventId: string | null;
  googleCalendarId: string | null;
  ticketId: string | null;
  taskPriority: string | null;
  linkedTaskId: string | null;
  linkedTaskTitle: string | null;
  links: string | null; // raw JSON; parsed in the detail dialog
  driveFolderUrl: string | null;
  // Three-state visibility: studentId set → student-specific;
  // studentId null + isGeneral false → team-only; studentId null +
  // isGeneral true → general (visible to all).
  isGeneral: boolean;
  recurring?: boolean; // synthetic occurrence flag (client-only)
  // True for task / sub-task mirror events (which use a noon-UTC
  // anchor as their startsAt). When true, render without a time
  // prefix and treat the event as an all-day pill.
  allDay?: boolean;
  // Set on sub-task mirror events. Used so the grid can route a
  // click to the parent task instead of opening a generic event
  // dialog, and so we can render sub-task pills distinctly.
  subtaskParentId?: string | null;
}

type LinkableTask = {
  id: string;
  title: string;
  status: string;
  studentId: string;
  studentName: string;
};

export function CalendarView({
  viewerRole,
  viewerStudentId,
  students,
  teamDriveFolderId,
  events: initial,
  tasks,
  availability,
  myAvailability,
  initialStudent,
  highlightByEvent: initialHighlights,
  holidays = [],
}: {
  viewerRole: string;
  viewerStudentId: string | null;
  students: Student[];
  teamDriveFolderId?: string | null;
  events: Event[];
  tasks: LinkableTask[];
  availability: {
    id: string;
    startsAt: string;
    endsAt: string;
    who: string;
    label: string | null;
    kind: string;
  }[];
  myAvailability: {
    id: string;
    startsAt: string;
    endsAt: string;
    label: string | null;
    kind: string;
  }[];
  initialStudent: string | null;
  initialMonth: string | null;
  highlightByEvent?: Record<string, "new" | "updated">;
  /** Sevilla public holidays in the visible window (ISO date + name). */
  holidays?: { date: string; name: string }[];
}) {
  // Lookup: dateKey "yyyy-MM-dd" → holiday name (first wins if a date
  // somehow has two entries). Used by month/week/day/mini views to
  // tint cells and label the day.
  const holidaysByDay = useMemo(() => {
    const map = new Map<string, string>();
    for (const h of holidays) {
      const key = format(new Date(h.date), "yyyy-MM-dd");
      if (!map.has(key)) map.set(key, h.name);
    }
    return map;
  }, [holidays]);
  const hideStudentFilter = viewerRole === "student";
  const isStudent = viewerRole === "student";
  const [highlightByEvent, setHighlightByEvent] = useState<Record<string, "new" | "updated">>(
    initialHighlights ?? {},
  );
  const [dismissedEventIds, setDismissedEventIds] = useState<Set<string>>(new Set());

  function effectiveKind(eventId: string): "new" | "updated" | null {
    if (dismissedEventIds.has(eventId)) return null;
    return highlightByEvent[eventId] ?? null;
  }

  function dismissEvent(eventId: string) {
    const wasHighlighted = !!highlightByEvent[eventId] && !dismissedEventIds.has(eventId);
    setDismissedEventIds((prev) => {
      if (prev.has(eventId)) return prev;
      const next = new Set(prev);
      next.add(eventId);
      return next;
    });
    if (wasHighlighted) {
      fetch("/api/calendar/dismiss", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ eventId }),
      }).catch(() => {});
    }
  }
  const [cursor, setCursor] = useState(new Date());
  const [studentFilter, setStudentFilter] = useState(initialStudent ?? "");
  const [events, setEvents] = useState<Event[]>(initial);
  const [newOpen, setNewOpen] = useState(false);
  const [availOpen, setAvailOpen] = useState(false);
  const [availDay, setAvailDay] = useState<Date | null>(null);
  const [selectedDay, setSelectedDay] = useState<Date | null>(null);
  const [syncing, setSyncing] = useState(false);
  const [openEventId, setOpenEventId] = useState<string | null>(null);
  // Task opened from a calendar task-event: shown in place (stays in Calendar).
  const [peekTicketId, setPeekTicketId] = useState<string | null>(null);
  const [view, setView] = useState<"year" | "month" | "week" | "day">("month");
  // On mobile (< md) default to Day view — the hour timetable is the
  // only view that stays legible at phone width. Year is a 12-month
  // grid of tiny months, Month's 7-column grid loses any per-day
  // detail under 768px, Week needs ≥ 7 wide columns. Users can still
  // switch via the toggle. Runs once on mount.
  useEffect(() => {
    if (typeof window === "undefined") return;
    if (window.matchMedia("(max-width: 767px)").matches) setView("day");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const [recentlyDeleted, setRecentlyDeleted] = useState<Event[]>([]);
  // Identifies the current poll's window+filter. We only treat an event as
  // "deleted" when it vanishes between two polls of the SAME window/filter
  // — otherwise navigating months or switching the student filter would
  // wrongly flag out-of-scope events as deleted.
  const pollKeyRef = useRef<string>("");
  const router = useRouter();
  const openEvent = events.find((e) => e.id === openEventId) ?? null;

  // Active student in this view: students see themselves implicitly; everyone
  // else uses the filter dropdown. The banner / sync-disable triggers only
  // when a specific student is in scope and has no shared calendar.
  const activeStudentId = isStudent ? viewerStudentId ?? null : studentFilter || null;
  const activeStudent = activeStudentId
    ? students.find((s) => s.id === activeStudentId) ?? null
    : null;
  const noSharedCalendar = !!activeStudent && !activeStudent.calendarId;

  function goPrev() {
    if (view === "year") setCursor((c) => subMonths(c, 12));
    else if (view === "month") setCursor((c) => subMonths(c, 1));
    else if (view === "week") setCursor((c) => subWeeks(c, 1));
    else setCursor((c) => subDays(c, 1));
  }
  function goNext() {
    if (view === "year") setCursor((c) => addMonths(c, 12));
    else if (view === "month") setCursor((c) => addMonths(c, 1));
    else if (view === "week") setCursor((c) => addWeeks(c, 1));
    else setCursor((c) => addDays(c, 1));
  }
  const headerLabel =
    view === "year"
      ? format(cursor, "yyyy")
      : view === "month"
      ? format(cursor, "MMMM yyyy")
      : view === "week"
      ? (() => {
          const ws = startOfWeek(cursor, { weekStartsOn: 1 });
          const we = endOfWeek(cursor, { weekStartsOn: 1 });
          return `${format(ws, "MMM d")} – ${format(we, "MMM d, yyyy")}`;
        })()
      : format(cursor, "EEEE · MMM d, yyyy");

  const days = useMemo(() => {
    const start = startOfWeek(startOfMonth(cursor), { weekStartsOn: 1 });
    const end = endOfWeek(endOfMonth(cursor), { weekStartsOn: 1 });
    return eachDayOfInterval({ start, end });
  }, [cursor]);

  const filtered = useMemo(() => {
    const base = events.filter((e) => {
      if (studentFilter === "__general__")
        return e.student === null && e.isGeneral;
      return !studentFilter || e.student?.id === studentFilter;
    });
    const span = view === "year" ? 13 : 3;
    const rangeStart = startOfMonth(subMonths(cursor, span));
    const rangeEnd = endOfMonth(addMonths(cursor, span));
    const out: Event[] = [];
    for (const e of base) {
      if (!e.recurrenceRule) {
        out.push(e);
        continue;
      }
      const occ = expandOccurrences(
        new Date(e.startsAt),
        new Date(e.endsAt),
        e.recurrenceRule,
        rangeStart,
        rangeEnd,
      );
      for (const o of occ) {
        out.push({
          ...e,
          startsAt: o.start.toISOString(),
          endsAt: o.end.toISOString(),
          recurring: true,
        });
      }
    }
    return out;
  }, [events, studentFilter, cursor, view]);

  const dayEvents = useMemo(() => {
    const map: Record<string, Event[]> = {};
    for (const e of filtered) {
      const key = format(new Date(e.startsAt), "yyyy-MM-dd");
      (map[key] ??= []).push(e);
    }
    // Within each day, surface task events at the top.
    for (const key of Object.keys(map)) {
      map[key]!.sort((a, b) => {
        const aTask = a.ticketId ? 0 : 1;
        const bTask = b.ticketId ? 0 : 1;
        if (aTask !== bTask) return aTask - bTask;
        return a.startsAt.localeCompare(b.startsAt);
      });
    }
    return map;
  }, [filtered]);

  const deletedByDay = useMemo(() => {
    const map: Record<string, Event[]> = {};
    for (const e of recentlyDeleted) {
      const key = format(new Date(e.startsAt), "yyyy-MM-dd");
      (map[key] ??= []).push(e);
    }
    return map;
  }, [recentlyDeleted]);

  // Supervisor "Unavailable" spans, bucketed onto every day they cover.
  const availabilityByDay = useMemo(() => {
    const map: Record<string, { who: string; label: string | null }[]> = {};
    for (const a of availability) {
      const s = new Date(a.startsAt);
      const e = new Date(a.endsAt);
      const cur = new Date(s.getFullYear(), s.getMonth(), s.getDate());
      let guard = 0;
      while (cur <= e && guard++ < 400) {
        const key = format(cur, "yyyy-MM-dd");
        (map[key] ??= []).push({ who: a.who, label: a.label });
        cur.setDate(cur.getDate() + 1);
      }
    }
    return map;
  }, [availability]);

  // Version-gated refetch — replaces the 20s interval poll. The
  // UnreadProvider drives /api/unread freshness across the app; here
  // we only do a full /api/calendar/events/list fetch when the
  // calendar version actually moves (someone else made a change).
  // Idle sessions where nothing's happening generate zero list
  // fetches. Self-changes don't bump the version (server filters
  // actorId != me), so optimistic state updates from create/edit/
  // delete don't ricochet here.
  const calendarVersion = useSectionVersion("calendar");
  const lastSeenCalendarVersionRef = useRef<string | null>(null);

  async function fetchEvents() {
    // Skip while a dialog is open — yanking state during interaction
    // is the worst-case UX.
    if (newOpen || openEventId) return;
    const isYear = view === "year";
    const from = (isYear
      ? new Date(cursor.getFullYear(), 0, 1)
      : subMonths(startOfMonth(cursor), 1)
    ).toISOString();
    const to = (isYear
      ? new Date(cursor.getFullYear(), 11, 31, 23, 59, 59)
      : addMonths(endOfMonth(cursor), 1)
    ).toISOString();
    const params = new URLSearchParams({ from, to });
    if (studentFilter) params.set("student", studentFilter);
    const pollKey = `${from}|${to}|${studentFilter}|${view}`;
    try {
      const r = await fetch(
        `/api/calendar/events/list?${params.toString()}`,
        { cache: "no-store" },
      );
      if (!r.ok) return;
      const j = await r.json();
      setEvents((prev) => {
        const newIds = new Set<string>(j.events.map((e: Event) => e.id));
        if (pollKeyRef.current === pollKey) {
          const gone = prev.filter(
            (e) =>
              !newIds.has(e.id) &&
              !e.recurring &&
              !e.ticketId &&
              !e.linkedTaskId,
          );
          if (gone.length > 0) {
            setRecentlyDeleted((rd) => {
              const have = new Set(rd.map((e) => e.id));
              return [...rd, ...gone.filter((e) => !have.has(e.id))];
            });
          }
        }
        pollKeyRef.current = pollKey;
        return j.events;
      });
      setHighlightByEvent(j.highlightByEvent ?? {});
    } catch {
      // ignore transient errors
    }
  }

  // Refetch when calendar version moves. First version observed sets
  // the baseline (SSR'd events are already that snapshot).
  useEffect(() => {
    if (calendarVersion === null) return;
    if (lastSeenCalendarVersionRef.current === null) {
      lastSeenCalendarVersionRef.current = calendarVersion;
      return;
    }
    if (lastSeenCalendarVersionRef.current === calendarVersion) return;
    lastSeenCalendarVersionRef.current = calendarVersion;
    fetchEvents();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [calendarVersion]);

  // Refetch when navigation/filter changes (different window or
  // student filter — the server may return a different set even if
  // peers haven't done anything). Cursor + view + studentFilter
  // changes here mirror what the old poll's deps used to be.
  useEffect(() => {
    fetchEvents();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cursor, studentFilter, view]);

  // Safety backstop: a full refresh every 5 minutes catches any drift
  // (events whose deletion isn't logged, etc). Cheap relative to the
  // previous 20s polling.
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
          await fetchEvents();
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

  async function syncFromGoogle() {
    setSyncing(true);
    const r = await fetch(
      `/api/calendar/sync?from=${encodeURIComponent(startOfMonth(cursor).toISOString())}&to=${encodeURIComponent(endOfMonth(cursor).toISOString())}${studentFilter ? `&student=${studentFilter}` : ""}`,
      { method: "POST" },
    );
    setSyncing(false);
    if (r.ok) router.refresh();
    else {
      const j = await r.json().catch(() => ({}));
      alert(j.error ?? "Sync failed — make sure you are signed in with Google.");
    }
  }

  // Hydration-safe "now" — null on SSR + first client render, then
  // set to the actual current time post-mount. The Upcoming list
  // used `new Date()` directly inside render, which produces a
  // DIFFERENT timestamp on the server vs the client, which in turn
  // makes the SSR-rendered list and the client's first render
  // produce different children. React 18 hydration leaves the
  // orphan SSR LIs in the DOM in that case (the React virtual tree
  // has the correct 8 LIs but the real DOM ends up with 9 — the
  // 9th being a leftover from SSR that no longer matches anything
  // on the client). Gating with a useEffect-set value gives both
  // SSR and the first client render identical output (`now=null`
  // → no future filter), and only after mount do we tighten to the
  // real time.
  const [nowForUpcoming, setNowForUpcoming] = useState<Date | null>(null);
  useEffect(() => {
    setNowForUpcoming(new Date());
    const t = setInterval(() => setNowForUpcoming(new Date()), 60_000);
    return () => clearInterval(t);
  }, []);

  const upcoming = (() => {
    // Defensive pipeline: chronologically sort, then dedupe by
    // (id + startsAt), then slice. The dedupe is for safety in case
    // upstream ever produces (id, startsAt) collisions; the sort +
    // unique-per-occurrence keys are what actually fix the
    // hydration-mismatch leftover bug.
    const future = nowForUpcoming
      ? filtered.filter((e) => new Date(e.startsAt) >= nowForUpcoming)
      : filtered.slice();
    future.sort((a, b) => a.startsAt.localeCompare(b.startsAt));
    const seen = new Set<string>();
    const deduped: typeof future = [];
    for (const e of future) {
      const k = `${e.id}|${e.startsAt}`;
      if (seen.has(k)) continue;
      seen.add(k);
      deduped.push(e);
    }
    return deduped.slice(0, 8);
  })();

  return (
    <div className="flex flex-col h-[calc(100vh-4rem)]">
      {/* Toolbar: wraps to two rows on mobile so the prev/next/today/
          view-toggle don't overflow. Smaller padding + smaller header
          text at narrow widths. */}
      <div className="flex items-center justify-between gap-3 flex-wrap px-4 md:px-6 lg:px-8 py-3 md:py-4 border-b bg-white">
        <div className="flex items-center gap-1 md:gap-3 flex-wrap">
          <Button size="icon" variant="ghost" onClick={goPrev}>
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <h1 className="text-base md:text-xl lg:text-2xl font-bold text-slate-900 md:min-w-[200px] text-center">
            {headerLabel}
          </h1>
          <Button size="icon" variant="ghost" onClick={goNext}>
            <ChevronRight className="h-4 w-4" />
          </Button>
          <Button size="sm" variant="outline" onClick={() => setCursor(new Date())}>
            Today
          </Button>
          {/* View toggle horizontally scrolls on the smallest screens
              instead of wrapping — keeps it on one line. */}
          <div className="flex rounded-lg border bg-slate-50 p-0.5 ml-0 md:ml-2 overflow-x-auto max-w-full">
            {(["year", "month", "week", "day"] as const).map((v) => (
              <button
                key={v}
                type="button"
                onClick={() => setView(v)}
                className={cn(
                  "px-2.5 md:px-3 py-1 text-xs font-semibold rounded-md transition-colors whitespace-nowrap",
                  view === v
                    ? "bg-white text-slate-900 shadow-sm"
                    : "text-slate-500 hover:text-slate-900",
                )}
              >
                {v[0].toUpperCase() + v.slice(1)}
              </button>
            ))}
          </div>
        </div>
        <div className="flex gap-2 flex-wrap">
          {!hideStudentFilter && (
            <Select
              value={studentFilter}
              onChange={(e) => setStudentFilter(e.target.value)}
              className="!w-48"
            >
              <option value="">All</option>
              <option value="__general__">— General only —</option>
              {students.map((s) => (
                <option key={s.id} value={s.id}>{displayName(s)}</option>
              ))}
            </Select>
          )}
          <Button
            variant="outline"
            onClick={syncFromGoogle}
            disabled={syncing || noSharedCalendar}
            title={
              noSharedCalendar
                ? "No shared calendar to sync from — create one first"
                : "Pull events from Google Calendar"
            }
          >
            <RefreshCw className={cn("h-4 w-4", syncing && "animate-spin")} />
            Sync Google
          </Button>
          {!isStudent && (
            <Button variant="outline" onClick={() => setAvailOpen(true)}>
              ⊘ My availability
            </Button>
          )}
          <Button variant="brand" onClick={() => setNewOpen(true)}>
            <Plus className="h-4 w-4" /> New event
          </Button>
        </div>
      </div>

      <MyAvailabilityDialog
        open={availOpen}
        onOpenChange={setAvailOpen}
        initial={myAvailability}
      />

      <Dialog
        open={!!availDay}
        onOpenChange={(o) => !o && setAvailDay(null)}
      >
        <DialogContent className="!max-w-md">
          <DialogHeader>
            <DialogTitle>
              Supervisor availability
              {availDay ? ` — ${format(availDay, "EEE, MMM d")}` : ""}
            </DialogTitle>
          </DialogHeader>
          {(() => {
            if (!availDay) return null;
            const dayStart = new Date(
              availDay.getFullYear(),
              availDay.getMonth(),
              availDay.getDate(),
            );
            const dayEnd = new Date(dayStart);
            dayEnd.setHours(23, 59, 59, 999);
            const list = availability.filter(
              (a) =>
                new Date(a.startsAt) <= dayEnd &&
                new Date(a.endsAt) >= dayStart,
            );
            if (list.length === 0)
              return (
                <p className="text-sm text-slate-500">
                  No availability info for this day.
                </p>
              );
            return (
              <ul className="space-y-2">
                {list.map((a) => (
                  <li
                    key={a.id}
                    className="rounded-lg border bg-slate-50 p-3 text-sm"
                  >
                    <div className="font-medium text-slate-900">
                      ⊘ {a.who} — unavailable
                    </div>
                    <div className="text-xs text-slate-600 mt-0.5">
                      {format(new Date(a.startsAt), "MMM d")} –{" "}
                      {format(new Date(a.endsAt), "MMM d, yyyy")}
                    </div>
                    {a.label && (
                      <div className="text-xs text-slate-500 mt-0.5">
                        {a.label}
                      </div>
                    )}
                  </li>
                ))}
              </ul>
            );
          })()}
        </DialogContent>
      </Dialog>

      {noSharedCalendar && activeStudent && (
        <div className="border-b bg-amber-50 px-6 lg:px-8 py-3 flex items-start sm:items-center gap-3 flex-wrap">
          <AlertCircle className="h-5 w-5 text-amber-700 shrink-0 mt-0.5 sm:mt-0" />
          <div className="flex-1 min-w-0 text-sm text-amber-900">
            <strong>{displayName(activeStudent)}</strong> doesn&apos;t have a
            shared Google Calendar yet.{" "}
            {isStudent
              ? "Create one and your supervisors will be granted writer access automatically."
              : "Create one in your Google account; the student and the rest of the team will get writer access automatically."}
          </div>
          {/* Admin / supervisor can also provision now — the API
              accepts canWriteForStudent, not just self. The acting
              user becomes the Google calendar owner. */}
          <CalendarShareButton
            studentId={activeStudent.id}
            hasCalendar={false}
          />
        </div>
      )}

      <div className="flex-1 grid grid-cols-1 xl:grid-cols-[1fr_320px] gap-0 overflow-hidden">
        <div className="flex flex-col overflow-hidden">
          {view === "year" && (
            <YearGrid
              year={cursor.getFullYear()}
              events={filtered}
              availabilityByDay={availabilityByDay}
              holidaysByDay={holidaysByDay}
              onPickDay={(day) => {
                setCursor(day);
                setView("month");
              }}
            />
          )}
          {view === "month" && (
            <>
              <div className="grid grid-cols-7 border-b bg-slate-50">
                {["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map((d) => (
                  <div
                    key={d}
                    className="px-3 py-2 text-xs font-semibold uppercase text-slate-500 text-center"
                  >
                    {d}
                  </div>
                ))}
              </div>
              {/* `auto-rows-[minmax(110px,auto)]` (instead of grid-rows-6)
                  matters at narrow viewports where the page becomes a
                  single column and the Upcoming list stacks under the
                  calendar. In that layout the grid container's height
                  is no longer constrained, so `grid-rows-6` (which is
                  `repeat(6, minmax(0, 1fr))`) collapses every row
                  track to 0 — cells then overflow their own rows and
                  events visually bleed into the next week's cell.
                  Auto-rows gives each row its content height with a
                  110px floor and keeps the visual alignment intact. */}
              <div className="grid grid-cols-7 auto-rows-[minmax(110px,auto)] flex-1 overflow-y-auto">
                {days.map((day) => {
                  const key = format(day, "yyyy-MM-dd");
                  const evs = dayEvents[key] ?? [];
                  const ghosts = deletedByDay[key] ?? [];
                  const inMonth = isSameMonth(day, cursor);
                  const today = isSameDay(day, new Date());
                  const holidayName = holidaysByDay.get(key);
                  return (
                    <div
                      key={key}
                      role="button"
                      tabIndex={0}
                      onClick={(e) => {
                        if (e.target !== e.currentTarget) return;
                        setSelectedDay(day);
                        setNewOpen(true);
                      }}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" || e.key === " ") {
                          setSelectedDay(day);
                          setNewOpen(true);
                        }
                      }}
                      className={cn(
                        "flex flex-col cursor-pointer text-left border-b border-r p-2 min-h-[110px] hover:bg-slate-50 transition-colors group",
                        !inMonth && "bg-slate-50/50",
                        // Public-holiday tint — applied AFTER !inMonth so
                        // a leading/trailing day that's also a holiday
                        // still reads as a holiday cell.
                        holidayName && "bg-rose-50/60 hover:bg-rose-50",
                      )}
                    >
                      {/* Explicit flex row keeps the day badge anchored at
                          the top of its own cell — previously the badge was
                          `inline-flex` directly inside a block cell, which
                          on some browsers visually pulled the events block
                          downward, making events appear to belong to the
                          next week's cell. */}
                      <div className="flex items-center gap-1">
                        <span
                          className={cn(
                            "inline-flex h-6 w-6 items-center justify-center rounded-full text-xs font-semibold",
                            today
                              ? "bg-[var(--c-violet)] text-white"
                              : inMonth
                              ? "text-slate-700"
                              : "text-slate-400",
                          )}
                        >
                          {format(day, "d")}
                        </span>
                        {holidayName && (
                          <span
                            className="truncate rounded-full bg-rose-100 px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wide text-rose-700"
                            title={`Public holiday — ${holidayName} · Sevilla`}
                          >
                            🎉 {holidayName}
                          </span>
                        )}
                      </div>
                      <div className="mt-1 flex-1 space-y-1">
                        {(() => {
                          const av = availabilityByDay[key] ?? [];
                          if (av.length === 0) return null;
                          const names = av.map((a) => a.who);
                          const text =
                            av.length === 1
                              ? `⊘ ${names[0]} away`
                              : `⊘ ${av.length} supervisors away`;
                          return (
                            <button
                              type="button"
                              onClick={(ev) => {
                                ev.stopPropagation();
                                setAvailDay(day);
                              }}
                              className="block w-full truncate rounded bg-slate-200 px-1.5 py-0.5 text-left text-[10px] font-medium text-slate-600 hover:bg-slate-300"
                            >
                              {text}
                            </button>
                          );
                        })()}
                        {evs.slice(0, 3).map((e) => {
                          const kind = effectiveKind(e.id);
                          const isTask = !!e.ticketId;
                          // Sub-task mirror events have a parent task
                          // but no ticketId of their own. By default we
                          // route their click to the parent task so
                          // the user lands in context — UNLESS the
                          // sub-task event has been converted into a
                          // 1:1 meeting (isMeeting=true), in which
                          // case open the event dialog instead so the
                          // meeting's agenda / notes / action items
                          // are reachable. Otherwise the meeting notes
                          // appear lost (they're on the event row,
                          // not the task).
                          const isSubtask = !!e.subtaskParentId;
                          if (isSubtask) {
                            const cleanTitle = e.title;
                            const goesToMeeting = !!e.isMeeting;
                            return (
                              <button
                                key={e.id}
                                onClick={(ev) => {
                                  ev.stopPropagation();
                                  dismissEvent(e.id);
                                  if (goesToMeeting) {
                                    setOpenEventId(e.id);
                                  } else if (e.subtaskParentId) {
                                    setPeekTicketId(e.subtaskParentId);
                                  }
                                }}
                                className={cn(
                                  "group flex w-full items-center gap-1 text-left text-[11px] truncate rounded border border-dashed bg-white pl-1.5 pr-1.5 py-0.5 font-medium hover:bg-slate-50",
                                  kind === "new" && "ring-2 ring-[var(--c-red)]",
                                  kind === "updated" && "ring-2 ring-[var(--c-blue)]",
                                )}
                                title={`Sub-task · ${cleanTitle}${e.student ? " · " + displayName(e.student) : ""}`}
                              >
                                <span className="inline-block h-2 w-2 shrink-0 rounded-full bg-slate-400" />
                                <span className="flex-1 truncate text-slate-600">
                                  {cleanTitle}
                                </span>
                              </button>
                            );
                          }
                          if (isTask) {
                            const pColor = taskPriorityColor(e.taskPriority);
                            const cleanTitle = e.title;
                            return (
                              <button
                                key={e.id}
                                onClick={(ev) => {
                                  ev.stopPropagation();
                                  dismissEvent(e.id);
                                  setPeekTicketId(e.ticketId);
                                }}
                                className={cn(
                                  "group flex w-full items-center gap-1 text-left text-[11px] truncate rounded border bg-white pl-0 pr-1.5 py-0.5 font-medium hover:bg-slate-50",
                                  kind === "new" && "ring-2 ring-[var(--c-red)]",
                                  kind === "updated" && "ring-2 ring-[var(--c-blue)]",
                                )}
                                title={`Task · ${cleanTitle}${e.student ? " · " + displayName(e.student) : ""}`}
                              >
                                <span
                                  className="h-full w-1 self-stretch rounded-l-sm"
                                  style={{ background: pColor }}
                                />
                                <span
                                  className="inline-block h-2 w-2 shrink-0 rounded-full border-2"
                                  style={{ borderColor: pColor }}
                                />
                                <span className="flex-1 truncate text-slate-700">
                                  {cleanTitle}
                                </span>
                                {e.taskPriority && (
                                  <span
                                    className="rounded px-1 text-[9px] font-bold uppercase text-white"
                                    style={{ background: pColor }}
                                  >
                                    {e.taskPriority[0]}
                                  </span>
                                )}
                              </button>
                            );
                          }
                          return (
                            <button
                              key={e.id}
                              onClick={(ev) => {
                                ev.stopPropagation();
                                setOpenEventId(e.id);
                                dismissEvent(e.id);
                              }}
                              className={cn(
                                "block w-full text-left text-[11px] truncate rounded px-1.5 py-0.5 font-medium hover:opacity-80",
                                kind === "new" &&
                                  "ring-2 ring-[var(--c-red)] bg-red-50 animate-pulse-red",
                                kind === "updated" &&
                                  "ring-2 ring-[var(--c-blue)] bg-blue-50 animate-pulse-blue",
                              )}
                              style={
                                kind
                                  ? undefined
                                  : {
                                      background: `${e.student?.color ?? "#6366f1"}1f`,
                                      color: e.student?.color ?? "#6366f1",
                                    }
                              }
                              title={e.title}
                            >
                              {kind && (
                                <span
                                  className={cn(
                                    "mr-1 inline-block rounded-sm px-1 text-[8px] font-bold uppercase text-white",
                                    kind === "new" ? "bg-[var(--c-red)]" : "bg-[var(--c-blue)]",
                                  )}
                                >
                                  {kind === "new" ? "new" : "upd"}
                                </span>
                              )}
                              {e.allDay ? (
                                <span className="mr-1 inline-block rounded-sm bg-slate-400/20 px-1 text-[8px] font-bold uppercase text-slate-600">
                                  all day
                                </span>
                              ) : (
                                <>{format(new Date(e.startsAt), "HH:mm")} </>
                              )}
                              {e.title}
                            </button>
                          );
                        })}
                        {evs.length > 3 && (
                          <button
                            type="button"
                            onClick={(ev) => {
                              ev.stopPropagation();
                              setCursor(day);
                              setView("day");
                            }}
                            className="block w-full rounded px-1 py-0.5 text-left text-[10px] font-semibold text-[var(--c-violet)] hover:bg-violet-50"
                            title={`Show all ${evs.length} on this day`}
                          >
                            +{evs.length - 3} more
                          </button>
                        )}
                        {ghosts.map((e) => {
                          const cleanTitle = e.title;
                          return (
                            <div
                              key={`del-${e.id}`}
                              className="group flex items-center gap-1 rounded border-2 border-dashed bg-slate-50 px-1.5 py-0.5 text-[11px] line-through text-slate-500"
                              style={{ borderColor: "var(--c-red)" }}
                              title={`Deleted: ${cleanTitle}`}
                            >
                              <span
                                className="rounded-sm px-1 text-[8px] font-bold uppercase text-white"
                                style={{ background: "var(--c-red)" }}
                              >
                                del
                              </span>
                              <span className="flex-1 truncate">{cleanTitle}</span>
                              <button
                                type="button"
                                onClick={(ev) => {
                                  ev.stopPropagation();
                                  setRecentlyDeleted((prev) =>
                                    prev.filter((r) => r.id !== e.id),
                                  );
                                }}
                                className="opacity-0 group-hover:opacity-100 text-slate-400 hover:text-slate-700"
                                title="Dismiss"
                              >
                                <XIcon className="h-3 w-3" />
                              </button>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  );
                })}
              </div>
            </>
          )}

          {(view === "week" || view === "day") && (
            <TimeGrid
              cursor={cursor}
              view={view}
              events={filtered}
              availabilityByDay={availabilityByDay}
              holidaysByDay={holidaysByDay}
              effectiveKind={effectiveKind}
              onEventClick={(id) => {
                // Mirror the month-grid routing: sub-task events
                // jump to the parent task by default, but a sub-task
                // that's been converted to a 1:1 meeting opens its
                // event dialog so the agenda / notes / action items
                // are reachable. Top-level task events also route
                // to the task peek.
                const ev = events.find((e) => e.id === id);
                if (ev?.ticketId) {
                  setPeekTicketId(ev.ticketId);
                } else if (ev?.subtaskParentId && !ev.isMeeting) {
                  setPeekTicketId(ev.subtaskParentId);
                } else {
                  setOpenEventId(id);
                }
                dismissEvent(id);
              }}
              onSlotClick={(day) => {
                setSelectedDay(day);
                setNewOpen(true);
              }}
              onAvailClick={(day) => setAvailDay(day)}
            />
          )}
        </div>

        <aside className="border-l bg-white p-4 overflow-y-auto">
          <h3 className="text-sm font-semibold text-slate-900 mb-3">
            Upcoming
          </h3>
          {upcoming.length === 0 ? (
            <p className="text-xs text-slate-500">Nothing scheduled.</p>
          ) : (
            <ul className="space-y-3">
              {upcoming.map((e) => {
                const kind = effectiveKind(e.id);
                return (
                  // Key is per OCCURRENCE, not per event row — a
                  // recurring event has one row in the DB but
                  // multiple expanded occurrences in upcoming, so
                  // keying by e.id alone collides and confuses
                  // React's reconciler (orphan LIs survive
                  // hydration). `${id}|${startsAt}` is unique per
                  // occurrence.
                <li
                  key={`${e.id}|${e.startsAt}`}
                  onClick={() => {
                    dismissEvent(e.id);
                    if (e.ticketId) {
                      setPeekTicketId(e.ticketId);
                    } else {
                      setOpenEventId(e.id);
                    }
                  }}
                  className={cn(
                    "cursor-pointer rounded-xl border p-3 hover:shadow-sm hover:border-slate-300 transition-shadow",
                    kind === "new" && "border-2 border-[var(--c-red)] bg-red-50 animate-pulse-red",
                    kind === "updated" && "border-2 border-[var(--c-blue)] bg-blue-50 animate-pulse-blue",
                  )}
                >
                  <div className="flex items-start gap-2">
                    <div
                      className="h-9 w-1 rounded-full"
                      style={{ background: e.student?.color ?? "#6366f1" }}
                    />
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-semibold text-slate-900 truncate flex items-center gap-1.5">
                        {kind && (
                          <span
                            className={cn(
                              "inline-flex items-center rounded-full px-1.5 py-0.5 text-[9px] font-bold uppercase text-white",
                              kind === "new" ? "bg-[var(--c-red)]" : "bg-[var(--c-blue)]",
                            )}
                          >
                            {kind === "new" ? "new" : "upd"}
                          </span>
                        )}
                        <span className="truncate">{e.title}</span>
                      </div>
                      <div className="text-xs text-slate-500 mt-0.5">
                        {e.allDay
                          ? format(new Date(e.startsAt), "EEE MMM d") +
                            " · All day"
                          : format(new Date(e.startsAt), "EEE MMM d · HH:mm")}
                      </div>
                      {e.student && (
                        <Badge
                          color={e.student.color}
                          className="!text-[10px] mt-1"
                        >
                          {displayName(e.student)}
                        </Badge>
                      )}
                      <div className="mt-2 flex items-center gap-2 text-xs text-slate-500">
                        {e.location && (
                          <span className="flex items-center gap-1">
                            <MapPin className="h-3 w-3" />
                            <span className="truncate max-w-[120px]">{e.location}</span>
                          </span>
                        )}
                        {e.meetingUrl && (
                          <a
                            href={e.meetingUrl}
                            target="_blank"
                            rel="noopener"
                            className="flex items-center gap-1 text-[var(--c-teal)] hover:underline"
                          >
                            <Video className="h-3 w-3" /> Join
                          </a>
                        )}
                      </div>
                      {/* Mirror of the task-side 📅 N badge: when an event
                          is manually linked to a task, show a chip on its
                          own row (w-full so truncate behaves; never shares
                          horizontal space with the location/Join row).
                          Click peeks the linked task without leaving the
                          Calendar; stopPropagation so the outer <li>
                          doesn't open the event dialog. */}
                      {e.linkedTaskId && (
                        <button
                          type="button"
                          onClick={(ev) => {
                            ev.stopPropagation();
                            setPeekTicketId(e.linkedTaskId!);
                          }}
                          title={`Linked to task: ${e.linkedTaskTitle ?? "(open task)"}`}
                          className="mt-1.5 flex w-full items-center gap-1 rounded-md bg-orange-50 px-1.5 py-1 text-[11px] text-[var(--c-orange)] hover:bg-orange-100"
                        >
                          <KanbanSquare className="h-3 w-3 shrink-0" />
                          <span className="truncate text-left flex-1 min-w-0">
                            {e.linkedTaskTitle ?? "Linked task"}
                          </span>
                        </button>
                      )}
                    </div>
                  </div>
                </li>
                );
              })}
            </ul>
          )}

          <div className="mt-6 pt-4 border-t">
            <div className="text-xs font-semibold uppercase text-slate-500 mb-2">
              Calendars
            </div>
            <ul className="space-y-1.5">
              {students
                .filter((s) => s.calendarId)
                .map((s) => (
                  <li key={s.id}>
                    <a
                      href={openCalendarUrl(s.calendarId!)}
                      target="_blank"
                      rel="noopener"
                      className="flex items-center gap-2 text-xs hover:text-slate-900"
                    >
                      <span
                        className="h-2 w-2 rounded-full"
                        style={{ background: s.color }}
                      />
                      <span className="flex-1 truncate">{displayName(s)}</span>
                      <ExternalLink className="h-3 w-3 text-slate-400" />
                    </a>
                  </li>
                ))}
              {students.filter((s) => s.calendarId).length === 0 && (
                <p className="text-xs text-slate-400">
                  No shared calendars yet. Add a Google Calendar ID on a
                  student&apos;s profile.
                </p>
              )}
            </ul>
          </div>
        </aside>
      </div>

      <NewEventDialog
        open={newOpen}
        onOpenChange={setNewOpen}
        students={students}
        tasks={tasks}
        teamDriveFolderId={teamDriveFolderId ?? null}
        defaultDate={selectedDay}
        defaultStudentId={
          isStudent && viewerStudentId
            ? viewerStudentId
            : studentFilter || null
        }
        isStudent={isStudent}
        onCreated={(e) => {
          setEvents((prev) => [...prev, e]);
          setNewOpen(false);
        }}
      />

      <EventDetailDialog
        event={openEvent}
        open={!!openEvent}
        tasks={tasks}
        students={students}
        teamDriveFolderId={teamDriveFolderId ?? null}
        canAssignStudent={!isStudent}
        onOpenChange={(o) => !o && setOpenEventId(null)}
        onPeekTask={(id) => {
          setOpenEventId(null);
          setPeekTicketId(id);
        }}
        onDeleted={(id) => {
          setEvents((prev) => prev.filter((e) => e.id !== id));
          setOpenEventId(null);
        }}
        onUpdated={(updates) => {
          // Sync changes made from within the dialog (Drive folder
          // pick, 1:1 toggle, etc) back into the parent events state
          // so the dialog re-renders with the new values without
          // needing a full page reload.
          if (!openEventId) return;
          setEvents((prev) =>
            prev.map((e) => (e.id === openEventId ? { ...e, ...updates } : e)),
          );
        }}
      />

      <TaskPeek
        ticketId={peekTicketId}
        onClose={() => setPeekTicketId(null)}
      />
    </div>
  );
}

function EventDetailDialog({
  event,
  open,
  tasks,
  students,
  teamDriveFolderId,
  canAssignStudent,
  onOpenChange,
  onPeekTask,
  onDeleted,
  onUpdated,
}: {
  event: Event | null;
  open: boolean;
  tasks: LinkableTask[];
  students: Student[];
  teamDriveFolderId?: string | null;
  canAssignStudent: boolean;
  onOpenChange: (b: boolean) => void;
  onPeekTask: (ticketId: string) => void;
  onDeleted: (id: string) => void;
  onUpdated: (updates: Partial<Event>) => void;
}) {
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);
  const router = useRouter();

  if (!event) return null;
  const linkedToGoogle = !!event.googleEventId;
  const rec = parseRRule(event.recurrenceRule);
  const recSummary =
    rec.freq === "none"
      ? null
      : `Every ${rec.interval > 1 ? rec.interval + " " : ""}${
          rec.freq === "daily"
            ? "day"
            : rec.freq === "weekly"
              ? "week"
              : "month"
        }${rec.interval > 1 ? "s" : ""}${
          rec.until ? ` until ${rec.until}` : ""
        }`;

  async function stopRepeating() {
    if (!event) return;
    if (!confirm("Stop this event repeating? Past occurrences stay; it won't recur again.")) return;
    await fetch(`/api/calendar/events/${event.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ recurrenceRule: null, pushToGoogle: true }),
    });
    onOpenChange(false);
    router.refresh();
  }

  async function del(alsoGoogle: boolean) {
    if (!event) return;
    if (
      !confirm(
        alsoGoogle
          ? `Delete "${event.title}" from PhDapp AND Google Calendar?`
          : `Delete "${event.title}" from PhDapp only?`,
      )
    )
      return;
    setDeleting(true);
    setError(null);
    const r = await fetch(
      `/api/calendar/events/${event.id}${alsoGoogle ? "?google=1" : ""}`,
      { method: "DELETE" },
    );
    setDeleting(false);
    if (!r.ok) {
      const j = await r.json().catch(() => ({}));
      setError(j.error ?? "Could not delete");
      return;
    }
    const j = await r.json().catch(() => ({}));
    if (j.googleWarning) alert(j.googleWarning);
    onDeleted(event.id);
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        if (!o) setEditing(false);
        onOpenChange(o);
      }}
    >
      <DialogContent className="!max-w-md">
        <DialogHeader>
          <DialogTitle>{event.title}</DialogTitle>
        </DialogHeader>

        {editing && (
          <EventEditForm
            event={event}
            tasks={tasks}
            students={students}
            canAssignStudent={canAssignStudent}
            onCancel={() => setEditing(false)}
            onSaved={() => {
              setEditing(false);
              onOpenChange(false);
              router.refresh();
            }}
          />
        )}

        {!editing && (
        <>
        <div className="space-y-3 text-sm">
          <div className="flex items-center gap-2 text-slate-700">
            <Clock className="h-4 w-4 text-slate-400" />
            <span>
              {format(new Date(event.startsAt), "EEE, MMM d · HH:mm")} –{" "}
              {format(new Date(event.endsAt), "HH:mm")}
            </span>
          </div>

          {event.student && (
            <div className="flex items-center gap-2 text-slate-700">
              <UsersIcon className="h-4 w-4 text-slate-400" />
              <Badge color={event.student.color}>{displayName(event.student)}</Badge>
            </div>
          )}

          {event.linkedTaskId && (
            <div className="flex items-center gap-2 text-slate-700">
              <KanbanSquare className="h-4 w-4 text-slate-400" />
              <button
                type="button"
                onClick={() => onPeekTask(event.linkedTaskId!)}
                className="text-[var(--c-teal)] hover:underline text-left"
                title="Open the related task"
              >
                Related task: {event.linkedTaskTitle ?? "View task"}
              </button>
            </div>
          )}

          {/* Sub-task events keep a back-pointer to the parent task so
              the user can navigate to context even when the event has
              been converted into a 1:1 meeting (whose click in the
              grid now lands here on the event dialog, not the task). */}
          {event.subtaskParentId && !event.linkedTaskId && (
            <div className="flex items-center gap-2 text-slate-700">
              <KanbanSquare className="h-4 w-4 text-slate-400" />
              <button
                type="button"
                onClick={() => onPeekTask(event.subtaskParentId!)}
                className="text-[var(--c-teal)] hover:underline text-left"
                title="Open the parent task"
              >
                Parent task
              </button>
            </div>
          )}

          {event.location && (
            <div className="flex items-center gap-2 text-slate-700">
              <MapPin className="h-4 w-4 text-slate-400" />
              <span>{event.location}</span>
            </div>
          )}

          {event.meetingUrl && (
            <div className="flex items-center gap-2 text-slate-700">
              <Video className="h-4 w-4 text-slate-400" />
              <a
                href={event.meetingUrl}
                target="_blank"
                rel="noopener"
                className="text-[var(--c-teal)] hover:underline truncate"
              >
                {event.meetingUrl}
              </a>
            </div>
          )}

          {event.description && (
            <div className="rounded-lg bg-slate-50 p-3 text-slate-700 whitespace-pre-wrap">
              {event.description}
            </div>
          )}

          {event.isMeeting ? (
            <MeetingPanel event={event} onUpdated={onUpdated} />
          ) : (
            // Lets the user upgrade a regular event into a 1:1 meeting
            // after the fact — flips isMeeting=true via PATCH so the
            // MeetingPanel (agenda · notes · action items) appears.
            <button
              type="button"
              onClick={async () => {
                const r = await fetch(`/api/calendar/events/${event.id}`, {
                  method: "PATCH",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({ isMeeting: true }),
                });
                if (r.ok) onUpdated({ isMeeting: true });
              }}
              className="flex w-full items-center justify-center gap-1.5 rounded-lg border border-dashed border-slate-300 bg-slate-50 px-3 py-2 text-xs font-medium text-slate-600 hover:border-[var(--c-teal)] hover:text-[var(--c-teal)] hover:bg-teal-50/40"
              title="Adds an Agenda, Notes and Action items panel to this event"
            >
              <UsersIcon className="h-3.5 w-3.5" />
              Convert to 1:1 meeting (add agenda · notes · action items)
            </button>
          )}

          {recSummary && (
            <div className="flex items-center justify-between gap-2 rounded-lg bg-violet-50 px-3 py-2 text-xs text-[var(--c-violet)]">
              <span>↻ Repeats: {recSummary}</span>
              <button
                type="button"
                onClick={stopRepeating}
                className="font-semibold hover:underline"
              >
                Stop repeating
              </button>
            </div>
          )}

          <div className="flex items-center gap-1 text-xs text-slate-500">
            <span
              className={cn(
                "h-1.5 w-1.5 rounded-full",
                linkedToGoogle ? "bg-[var(--c-green)]" : "bg-slate-300",
              )}
            />
            {linkedToGoogle
              ? "Synced with Google Calendar"
              : "Local-only (not on Google Calendar)"}
          </div>

          {error && (
            <div className="text-sm text-[var(--c-red)] bg-red-50 rounded-lg p-3">
              {error}
            </div>
          )}
        </div>

        <div className="pt-3 mt-3 border-t">
          <EventDriveField
            event={event}
            students={students}
            teamDriveFolderId={teamDriveFolderId ?? null}
            onChanged={(url) => onUpdated({ driveFolderUrl: url })}
          />
        </div>

        <div className="pt-3 mt-3 border-t">
          <LinksSection
            initialLinks={parseLinks(event.links)}
            save={async (next) => {
              await fetch(`/api/calendar/events/${event.id}`, {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ links: next }),
              });
              router.refresh();
            }}
            composerLabelPlaceholder="Label (e.g. ‘Agenda doc’)"
          />
        </div>

        <div className="pt-3 mt-3 border-t">
          <CommentsThread
            apiBase={`/api/calendar/events/${event.id}/comments`}
            composerPlaceholder="Comment on this event…"
          />
        </div>

        <div className="flex flex-wrap justify-between gap-2 pt-3 mt-3 border-t">
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              variant="danger"
              size="sm"
              onClick={() => del(false)}
              disabled={deleting}
            >
              <Trash2 className="h-4 w-4" />
              Delete locally
            </Button>
            {linkedToGoogle && (
              <Button
                type="button"
                variant="danger"
                size="sm"
                onClick={() => del(true)}
                disabled={deleting}
              >
                <Trash2 className="h-4 w-4" />
                Delete from PhDapp + Google
              </Button>
            )}
          </div>
          <div className="flex gap-2">
            <Button
              type="button"
              variant="brand"
              size="sm"
              onClick={() => setEditing(true)}
            >
              Edit
            </Button>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Close
            </Button>
          </div>
        </div>
        </>
        )}
      </DialogContent>
    </Dialog>
  );
}

function EventEditForm({
  event,
  tasks,
  students,
  canAssignStudent,
  onCancel,
  onSaved,
}: {
  event: Event;
  tasks: LinkableTask[];
  students: Student[];
  canAssignStudent: boolean;
  onCancel: () => void;
  onSaved: () => void;
}) {
  const linkedToGoogle = !!event.googleEventId;
  const [linkedTaskId, setLinkedTaskId] = useState(event.linkedTaskId ?? "");
  const [studentId, setStudentId] = useState(event.student?.id ?? "");
  // Task picker follows the chosen student (else any visible task).
  const taskScopeStudentId = canAssignStudent
    ? studentId || null
    : event.student?.id ?? null;
  const taskOptions = (
    taskScopeStudentId
      ? tasks.filter((t) => t.studentId === taskScopeStudentId)
      : tasks
  ).slice();
  // Keep the currently-linked task selectable even if it falls outside the
  // student-scoped list (so editing other fields doesn't silently unlink it).
  if (
    event.linkedTaskId &&
    !taskOptions.some((t) => t.id === event.linkedTaskId)
  ) {
    const cur = tasks.find((t) => t.id === event.linkedTaskId);
    if (cur) taskOptions.unshift(cur);
    else if (event.linkedTaskTitle)
      taskOptions.unshift({
        id: event.linkedTaskId,
        title: event.linkedTaskTitle,
        status: "",
        studentId: event.student?.id ?? "",
        studentName: "",
      });
  }
  const s = new Date(event.startsAt);
  const en = new Date(event.endsAt);
  const [title, setTitle] = useState(event.title);
  const [date, setDate] = useState(format(s, "yyyy-MM-dd"));
  const [start, setStart] = useState(format(s, "HH:mm"));
  const [end, setEnd] = useState(format(en, "HH:mm"));
  const [location, setLocation] = useState(event.location ?? "");
  const [meetingUrl, setMeetingUrl] = useState(event.meetingUrl ?? "");
  const [description, setDescription] = useState(event.description ?? "");
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function save() {
    if (!title.trim()) {
      setErr("Title is required.");
      return;
    }
    // Build the exact instants from the local wall-clock values (the
    // browser knows the user's timezone) so the round-trip is stable.
    const sDate = new Date(`${date}T${start}:00`);
    const eDate = new Date(`${date}T${end}:00`);
    if (isNaN(sDate.getTime()) || isNaN(eDate.getTime())) {
      setErr("Invalid date or time.");
      return;
    }
    const startsAtISO = sDate.toISOString();
    const endsAtISO = eDate.toISOString();
    setSaving(true);
    setErr(null);
    let tz = "UTC";
    try {
      tz = Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
    } catch {
      /* keep UTC */
    }
    const r = await fetch(`/api/calendar/events/${event.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        title: title.trim(),
        date,
        startTime: start,
        endTime: end,
        startsAt: startsAtISO,
        endsAt: endsAtISO,
        location: location.trim() || null,
        meetingUrl: meetingUrl.trim() || null,
        description: description.trim() || null,
        linkedTaskId: linkedTaskId || null,
        ...(canAssignStudent ? { studentId: studentId || null } : {}),
        pushToGoogle: linkedToGoogle,
        timeZone: tz,
      }),
    });
    setSaving(false);
    if (!r.ok) {
      const j = await r.json().catch(() => ({}));
      setErr(j.error ?? "Could not save changes.");
      return;
    }
    const j = await r.json().catch(() => ({}));
    if (j.googleWarning) alert(j.googleWarning);
    onSaved();
  }

  return (
    <div className="space-y-3">
      <Field label="Title">
        <Input value={title} onChange={(e) => setTitle(e.target.value)} />
      </Field>
      {canAssignStudent && (
        <Field label="Student">
          <Select
            value={studentId}
            onChange={(e) => {
              setStudentId(e.target.value);
              setLinkedTaskId(""); // task list is student-scoped
            }}
          >
            <option value="">No specific student (General calendar)</option>
            {students.map((s) => (
              <option key={s.id} value={s.id}>
                {displayName(s)}
              </option>
            ))}
          </Select>
        </Field>
      )}
      <div className="grid grid-cols-3 gap-2">
        <Field label="Date">
          <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
        </Field>
        <Field label="Start">
          <Input type="time" value={start} onChange={(e) => setStart(e.target.value)} />
        </Field>
        <Field label="End">
          <Input type="time" value={end} onChange={(e) => setEnd(e.target.value)} />
        </Field>
      </div>
      <Field label="Location">
        <Input
          value={location}
          onChange={(e) => setLocation(e.target.value)}
          placeholder="Room, address…"
        />
      </Field>
      <Field label="Meeting link">
        <Input
          value={meetingUrl}
          onChange={(e) => setMeetingUrl(e.target.value)}
          placeholder="https://…"
        />
      </Field>
      <Field label="Description">
        <Textarea
          rows={3}
          value={description}
          onChange={(e) => setDescription(e.target.value)}
        />
      </Field>
      <Field label="Related task">
        <Select
          value={linkedTaskId}
          onChange={(e) => setLinkedTaskId(e.target.value)}
        >
          <option value="">Not linked to a task</option>
          {taskOptions.map((t) => (
            <option key={t.id} value={t.id}>
              {event.student ? t.title : `${t.studentName} — ${t.title}`}
            </option>
          ))}
        </Select>
      </Field>
      {err && (
        <div className="text-sm text-[var(--c-red)] bg-red-50 rounded-lg p-3">
          {err}
        </div>
      )}
      <div className="flex justify-end gap-2 pt-3 border-t">
        <Button type="button" variant="outline" onClick={onCancel} disabled={saving}>
          Cancel
        </Button>
        <Button
          type="button"
          variant="brand"
          onClick={save}
          disabled={saving || !title.trim()}
        >
          {saving ? "Saving…" : "Save changes"}
        </Button>
      </div>
      {linkedToGoogle && (
        <p className="text-[11px] text-slate-400">
          Changes also update the linked Google Calendar event.
        </p>
      )}
    </div>
  );
}

function NewEventDialog({
  open,
  onOpenChange,
  students,
  tasks,
  teamDriveFolderId,
  defaultDate,
  defaultStudentId,
  isStudent,
  onCreated,
}: {
  open: boolean;
  onOpenChange: (b: boolean) => void;
  students: Student[];
  tasks: LinkableTask[];
  teamDriveFolderId?: string | null;
  defaultDate: Date | null;
  defaultStudentId: string | null;
  isStudent: boolean;
  onCreated: (e: Event) => void;
}) {
  const [submitting, setSubmitting] = useState(false);
  const [pushGoogle, setPushGoogle] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [recurFreq, setRecurFreq] = useState<RecurFreq>("none");
  const [recurInterval, setRecurInterval] = useState(1);
  const [recurUntil, setRecurUntil] = useState("");
  const [isMeeting, setIsMeeting] = useState(false);
  // Default for non-student creators with no defaultStudentId is
  // "General" — events without a student are visible to everyone.
  const [studentId, setStudentId] = useState(
    defaultStudentId ?? (isStudent ? "" : "__general__"),
  );
  const [linkedTaskId, setLinkedTaskId] = useState("");
  // Optional Drive folder attached at creation (will be sent in payload).
  const [driveFolderUrl, setDriveFolderUrl] = useState<string | null>(null);

  // Tasks offered in the picker: scoped to the chosen student when one is
  // set, otherwise all visible tasks (labelled with the student name).
  // __general__ maps to "no student" for downstream logic.
  const effectiveStudentId = isStudent
    ? defaultStudentId
    : studentId && studentId !== "__general__"
      ? studentId
      : null;
  const taskOptions = effectiveStudentId
    ? tasks.filter((t) => t.studentId === effectiveStudentId)
    : tasks;

  const dateStr = defaultDate
    ? format(defaultDate, "yyyy-MM-dd")
    : format(new Date(), "yyyy-MM-dd");

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    const fd = new FormData(e.currentTarget);
    const payload = Object.fromEntries(fd.entries()) as Record<string, string>;
    if (isStudent && defaultStudentId) payload.studentId = defaultStudentId;
    if (linkedTaskId) payload.linkedTaskId = linkedTaskId;
    if (driveFolderUrl) payload.driveFolderUrl = driveFolderUrl;
    // Translate the sentinel value: __general__ means "no specific
    // student, visible to all" — POST with studentId omitted +
    // isGeneral:true. (Team-only is no longer offered.)
    const isGeneralChoice = payload.studentId === "__general__";
    if (isGeneralChoice) delete payload.studentId;
    // Compute exact instants in the browser's timezone so the stored time
    // matches what the user typed (server would otherwise parse as UTC).
    if (payload.date && payload.startTime && payload.endTime) {
      const sISO = new Date(`${payload.date}T${payload.startTime}:00`);
      const eISO = new Date(`${payload.date}T${payload.endTime}:00`);
      if (isNaN(sISO.getTime()) || isNaN(eISO.getTime())) {
        setSubmitting(false);
        setError("Invalid date or time.");
        return;
      }
      payload.startsAt = sISO.toISOString();
      payload.endsAt = eISO.toISOString();
    }
    payload.pushToGoogle = pushGoogle ? "1" : "";
    const rrule = buildRRule(recurFreq, recurInterval, recurUntil || null);
    if (rrule) payload.recurrenceRule = rrule;
    payload.isMeeting = isMeeting ? "1" : "";
    // Browser-detected IANA timezone (e.g. "Europe/Madrid"). Google
    // requires this on start/end whenever an event is recurring,
    // otherwise the events.insert call returns 400.
    try {
      payload.timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone;
    } catch {
      payload.timeZone = "UTC";
    }
    const r = await fetch("/api/calendar/events", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...payload, isGeneral: isGeneralChoice }),
    });
    setSubmitting(false);
    if (!r.ok) {
      const j = await r.json().catch(() => ({}));
      setError(j.error ?? "Could not create event");
      return;
    }
    const { event, googleWarning, pushedToGoogle } = await r.json();
    if (googleWarning) {
      // Either a hard failure (no pushedToGoogle) or a soft note (pushed to a
      // fallback calendar). The wording in googleWarning explains the case.
      alert(
        pushedToGoogle
          ? `Heads up:\n\n${googleWarning}`
          : `Event was saved locally, but pushing to Google Calendar failed:\n\n${googleWarning}`,
      );
    }
    onCreated(event);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>New event</DialogTitle>
        </DialogHeader>
        <form onSubmit={onSubmit} className="space-y-3">
          <Field label="Title">
            <Input name="title" required autoFocus placeholder="Weekly 1:1" />
          </Field>
          {!isStudent && (
            <Field label="Visibility / student">
              <Select
                name="studentId"
                value={studentId}
                onChange={(e) => {
                  setStudentId(e.target.value);
                  setLinkedTaskId(""); // task list is student-scoped
                }}
              >
                {/* Events are either tied to a specific student or
                    'General' (visible to everyone). Team-only events
                    are not supported (per product decision). */}
                <option value="__general__">— General (visible to all) —</option>
                {students.map((s) => (
                  <option key={s.id} value={s.id}>{displayName(s)}</option>
                ))}
              </Select>
            </Field>
          )}
          <div className="grid grid-cols-3 gap-3">
            <Field label="Date">
              <Input name="date" type="date" defaultValue={dateStr} required />
            </Field>
            <Field label="Start">
              <Input name="startTime" type="time" defaultValue="10:00" required />
            </Field>
            <Field label="End">
              <Input name="endTime" type="time" defaultValue="11:00" required />
            </Field>
          </div>
          <Field label="Location (optional)">
            <Input name="location" placeholder="Office, building B, room 12…" />
          </Field>
          <Field label="Meeting link (optional)">
            <Input name="meetingUrl" placeholder="https://meet.google.com/…" />
          </Field>
          <Field label="Drive folder (optional)">
            {(() => {
              const stu = effectiveStudentId
                ? students.find((s) => s.id === effectiveStudentId)
                : null;
              const multiRoots = !stu
                ? [
                    ...(teamDriveFolderId
                      ? [
                          {
                            id: teamDriveFolderId,
                            name: "Team folder",
                            kind: "team" as const,
                          },
                        ]
                      : []),
                    ...students
                      .filter((s) => s.driveFolderId)
                      .map((s) => ({
                        id: s.driveFolderId!,
                        name: (s.alias?.trim() || s.fullName) + " · Drive",
                        kind: "student" as const,
                      })),
                  ]
                : undefined;
              const id = driveFolderUrl
                ? driveFolderUrl.match(DRIVE_FOLDER_URL_RE)?.[1] ?? null
                : null;
              return (
                <DriveFolderPicker
                  value={id}
                  onChange={(folderId) =>
                    setDriveFolderUrl(
                      folderId
                        ? `https://drive.google.com/drive/folders/${folderId}`
                        : null,
                    )
                  }
                  triggerLabel={
                    driveFolderUrl ? "Change folder" : "Pick from Drive"
                  }
                  rootFolderId={stu?.driveFolderId ?? null}
                  rootFolderName={
                    stu ? (stu.alias?.trim() || stu.fullName) + " · Drive" : null
                  }
                  roots={multiRoots}
                />
              );
            })()}
          </Field>
          <Field label="Description (optional)">
            <Textarea name="description" rows={2} />
          </Field>
          <Field label="Related task (optional)">
            <Select
              value={linkedTaskId}
              onChange={(e) => setLinkedTaskId(e.target.value)}
            >
              <option value="">Not linked to a task</option>
              {taskOptions.map((t) => (
                <option key={t.id} value={t.id}>
                  {effectiveStudentId
                    ? t.title
                    : `${t.studentName} — ${t.title}`}
                </option>
              ))}
            </Select>
            <p className="text-[11px] text-slate-400 mt-1">
              Link this event to a task (e.g. a meeting about its progress).
              This is separate from the task’s own due-date entry.
            </p>
          </Field>
          <Field label="Repeats">
            <div className="flex flex-wrap items-center gap-2">
              <Select
                value={recurFreq}
                onChange={(e) => setRecurFreq(e.target.value as RecurFreq)}
                className="!w-auto"
              >
                <option value="none">Does not repeat</option>
                <option value="daily">Daily</option>
                <option value="weekly">Weekly</option>
                <option value="monthly">Monthly</option>
              </Select>
              {recurFreq !== "none" && (
                <>
                  <span className="text-xs text-slate-500">every</span>
                  <Input
                    type="number"
                    min={1}
                    value={recurInterval}
                    onChange={(e) =>
                      setRecurInterval(parseInt(e.target.value, 10) || 1)
                    }
                    className="!w-16"
                  />
                  <span className="text-xs text-slate-500">
                    {recurFreq === "daily"
                      ? "day(s)"
                      : recurFreq === "weekly"
                        ? "week(s)"
                        : "month(s)"}
                    , until
                  </span>
                  <Input
                    type="date"
                    value={recurUntil}
                    onChange={(e) => setRecurUntil(e.target.value)}
                    className="!w-auto"
                  />
                </>
              )}
            </div>
            {recurFreq !== "none" && (
              <p className="text-[11px] text-slate-400 mt-1">
                Editing or deleting a repeating event affects the whole series.
              </p>
            )}
          </Field>
          <label className="flex items-center gap-2 text-sm text-slate-700">
            <input
              type="checkbox"
              checked={isMeeting}
              onChange={(e) => setIsMeeting(e.target.checked)}
              className="h-4 w-4 rounded"
            />
            This is a 1:1 meeting (agenda, notes & action items)
          </label>
          <label className="flex items-center gap-2 text-sm text-slate-700">
            <input
              type="checkbox"
              checked={pushGoogle}
              onChange={(e) => setPushGoogle(e.target.checked)}
              className="h-4 w-4 rounded"
            />
            Also push to Google Calendar
          </label>
          {error && (
            <div className="text-sm text-[var(--c-red)] bg-red-50 rounded-lg p-3">{error}</div>
          )}
          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" variant="brand" disabled={submitting}>
              {submitting ? "Creating…" : "Create event"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="text-xs font-semibold text-slate-700">{label}</span>
      <div className="mt-1">{children}</div>
    </label>
  );
}

/**
 * Drive folder picker for a calendar event. Mirror of the task-side field:
 * when the event is tied to a student, the picker is scoped to that
 * student's Drive folder; otherwise the picker behaves normally
 * (My Drive / Shared with me).
 */
const DRIVE_FOLDER_URL_RE = /\/folders\/([a-zA-Z0-9_-]+)/;
function EventDriveField({
  event,
  students,
  teamDriveFolderId,
  onChanged,
}: {
  event: Event;
  students: Student[];
  teamDriveFolderId?: string | null;
  // Called with the new Drive URL (or null) after a successful PATCH.
  // The parent updates its events state so the dialog re-renders with
  // the new value — router.refresh() alone doesn't update useState.
  onChanged: (url: string | null) => void;
}) {
  const url = event.driveFolderUrl;
  const id = url ? url.match(DRIVE_FOLDER_URL_RE)?.[1] ?? null : null;
  const stu = event.student
    ? students.find((s) => s.id === event.student!.id)
    : null;
  // Unassigned event → offer a multi-root chooser instead of "My Drive".
  const multiRoots = !stu
    ? [
        ...(teamDriveFolderId
          ? [
              {
                id: teamDriveFolderId,
                name: "Team folder",
                kind: "team" as const,
              },
            ]
          : []),
        ...students
          .filter((s) => s.driveFolderId)
          .map((s) => ({
            id: s.driveFolderId!,
            name: (s.alias?.trim() || s.fullName) + " · Drive",
            kind: "student" as const,
          })),
      ]
    : undefined;
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

  async function persist(next: string | null) {
    const r = await fetch(`/api/calendar/events/${event.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ driveFolderUrl: next }),
    });
    if (r.ok) onChanged(next);
  }

  return (
    <div>
      <div className="text-xs font-semibold uppercase text-slate-500 mb-2 flex items-center gap-1.5">
        <FolderOpen className="h-3 w-3" />
        Drive folder
      </div>
      <div className="space-y-2">
        {url && (
          <a
            href={url}
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
            persist(
              folderId
                ? `https://drive.google.com/drive/folders/${folderId}`
                : null,
            )
          }
          triggerLabel={url ? "Change folder" : "Pick from Drive"}
          rootFolderId={stu?.driveFolderId ?? null}
          rootFolderName={
            stu ? (stu.alias?.trim() || stu.fullName) + " · Drive" : null
          }
          roots={multiRoots}
        />
      </div>
    </div>
  );
}

function MeetingPanel({
  event,
  onUpdated,
}: {
  event: Event;
  // Mirror of EventDetailDialog's onUpdated — called after every
  // successful PATCH so the parent's events state picks up the new
  // values immediately. Without this, the calendar's polled events
  // (which filter out the user's own activity by design) stay
  // stale and the user has to reload the page to see their own
  // saved notes / agenda / etc.
  onUpdated: (updates: Partial<Event>) => void;
}) {
  const router = useRouter();
  type Bullet = { id: string; text: string };
  const [agenda, setAgenda] = useState<Bullet[]>(() => {
    try {
      const a = event.agenda ? JSON.parse(event.agenda) : [];
      return Array.isArray(a)
        ? a.map((x: { id?: string; text?: string }) => ({
            id: x.id ?? Math.random().toString(36).slice(2),
            text: x.text ?? "",
          }))
        : [];
    } catch {
      return [];
    }
  });
  const [agendaDraft, setAgendaDraft] = useState("");
  const [notes, setNotes] = useState(event.meetingNotes ?? "");
  // Mirror of the last server-persisted value, kept in *state* (not just
  // a ref) so the "Unsaved changes" label and the disabled state of the
  // Save button update immediately after a successful PATCH — we can't
  // rely on `event.meetingNotes` here because the parent only re-fetches
  // on `router.refresh()` and the new prop may not have arrived yet.
  const [savedNotes, setSavedNotes] = useState(event.meetingNotes ?? "");
  useEffect(() => {
    setSavedNotes(event.meetingNotes ?? "");
  }, [event.meetingNotes]);
  // Keep a live ref of `notes` so the unmount-time flush sees the
  // latest value without re-creating the cleanup effect on every
  // keystroke.
  const notesRef = useRef(notes);
  notesRef.current = notes;
  const lastSavedNotesRef = useRef(savedNotes);
  lastSavedNotesRef.current = savedNotes;
  // If the dialog closes (panel unmounts) with unsaved notes — for
  // example the user clicks the X or outside the modal before the
  // textarea blur fires — flush the pending notes via a best-effort
  // PATCH so the content is never silently lost.
  useEffect(() => {
    return () => {
      const pending = notesRef.current;
      if (pending !== lastSavedNotesRef.current) {
        fetch(`/api/calendar/events/${event.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ meetingNotes: pending }),
          keepalive: true,
        }).catch(() => {});
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [event.id]);
  type ActionItem = {
    text: string;
    dueDate: string;
    priority: string;
    category: string;
  };
  const [actions, setActions] = useState<ActionItem[]>([]);
  const [actionDraft, setActionDraft] = useState("");
  const [actionDue, setActionDue] = useState("");
  const [actionPriority, setActionPriority] = useState("medium");
  const [actionCategory, setActionCategory] = useState("meeting");
  const [savedMsg, setSavedMsg] = useState("");

  function addAction() {
    const t = actionDraft.trim();
    if (!t) return;
    setActions((p) => [
      ...p,
      {
        text: t,
        dueDate: actionDue,
        priority: actionPriority,
        category: actionCategory,
      },
    ]);
    setActionDraft("");
    setActionDue("");
  }

  async function patch(body: Record<string, unknown>) {
    await fetch(`/api/calendar/events/${event.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (typeof body.meetingNotes === "string") {
      setSavedNotes(body.meetingNotes);
    }
    setSavedMsg("Saved");
    setTimeout(() => setSavedMsg(""), 1500);
    // Sync the parent's events state with the patched fields so the
    // calendar's view of THIS event updates immediately — the
    // version-gated poll excludes the user's own actions, so without
    // this hand-off the user has to reload the page to see their
    // own saved notes / agenda / etc.
    const updates: Partial<Event> = {};
    if (typeof body.meetingNotes === "string" || body.meetingNotes === null) {
      updates.meetingNotes = body.meetingNotes as string | null;
    }
    if (body.agenda !== undefined) {
      // The DB row stores agenda as JSON string; the API does the
      // serialization. Stringify here too so the parent's events
      // state matches what the next poll would return.
      updates.agenda = JSON.stringify(body.agenda);
    }
    if (typeof body.isMeeting === "boolean") {
      updates.isMeeting = body.isMeeting;
    }
    if (Object.keys(updates).length > 0) onUpdated(updates);
    router.refresh();
  }
  function addBullet() {
    const t = agendaDraft.trim();
    if (!t) return;
    const next = [...agenda, { id: Math.random().toString(36).slice(2), text: t }];
    setAgenda(next);
    setAgendaDraft("");
    patch({ agenda: next });
  }
  function removeBullet(id: string) {
    const next = agenda.filter((b) => b.id !== id);
    setAgenda(next);
    patch({ agenda: next });
  }
  async function createTasks() {
    const items = actions.map((a) => ({
      text: a.text,
      dueDate: a.dueDate || null,
      priority: a.priority,
      category: a.category,
    }));
    if (items.length === 0) return;
    const r = await fetch(`/api/calendar/events/${event.id}/action-items`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ items }),
    });
    if (r.ok) {
      setActions([]);
      setSavedMsg("Tasks created");
      setTimeout(() => setSavedMsg(""), 2000);
      router.refresh();
    } else {
      const j = await r.json().catch(() => ({}));
      alert(j.error ?? "Could not create tasks");
    }
  }

  return (
    <div className="rounded-lg border bg-white p-3 space-y-3">
      <div className="flex items-center justify-between">
        <span className="text-xs font-bold uppercase tracking-wide text-[var(--c-violet)]">
          1:1 meeting
        </span>
        {savedMsg && (
          <span className="text-[10px] text-[var(--c-green)]">{savedMsg}</span>
        )}
      </div>

      <div>
        <span className="text-xs font-semibold text-slate-700">Agenda</span>
        <ul className="mt-1 space-y-1">
          {agenda.map((b) => (
            <li key={b.id} className="flex items-center gap-2 text-sm group">
              <span className="text-slate-400">•</span>
              <span className="flex-1">{b.text}</span>
              <button
                type="button"
                onClick={() => removeBullet(b.id)}
                className="text-slate-300 hover:text-[var(--c-red)] opacity-0 group-hover:opacity-100"
              >
                <XIcon className="h-3 w-3" />
              </button>
            </li>
          ))}
        </ul>
        <div className="mt-1 flex gap-2">
          <Input
            value={agendaDraft}
            onChange={(e) => setAgendaDraft(e.target.value)}
            onKeyDown={(e) =>
              e.key === "Enter" && (e.preventDefault(), addBullet())
            }
            placeholder="Add agenda point…"
            className="!h-8 !text-sm"
          />
          <Button type="button" size="sm" variant="outline" onClick={addBullet}>
            Add
          </Button>
        </div>
      </div>

      <div>
        <div className="flex items-center justify-between">
          <span className="text-xs font-semibold text-slate-700">Notes</span>
          {notes !== savedNotes && (
            <span className="text-[10px] font-medium text-[var(--c-orange)]">
              Unsaved changes
            </span>
          )}
        </div>
        <Textarea
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          onBlur={() => notes !== savedNotes && patch({ meetingNotes: notes })}
          rows={3}
          className="mt-1"
          placeholder="Decisions, discussion…"
        />
        {/* Explicit Save preserves notes even if the dialog is closed
            before the textarea blur fires (e.g. user clicks the X). */}
        <div className="mt-1 flex justify-end">
          <Button
            type="button"
            size="sm"
            variant="outline"
            disabled={notes === savedNotes}
            onClick={() => patch({ meetingNotes: notes })}
          >
            Save notes
          </Button>
        </div>
      </div>

      <div>
        <span className="text-xs font-semibold text-slate-700">
          Action items → tasks
        </span>
        <ul className="mt-1 space-y-1">
          {actions.map((a, i) => {
            const pri = PRIORITIES.find((p) => p.id === a.priority);
            const cat = CATEGORIES.find((c) => c.id === a.category);
            return (
              <li
                key={i}
                className="flex items-center gap-2 text-sm group flex-wrap"
              >
                <span className="text-slate-400">☐</span>
                <span className="flex-1 min-w-0">{a.text}</span>
                {a.dueDate && (
                  <Badge color="#64748b">
                    {new Date(a.dueDate + "T00:00:00").toLocaleDateString(
                      undefined,
                      { month: "short", day: "numeric" },
                    )}
                  </Badge>
                )}
                <Badge color={pri?.color ?? "#94a3b8"}>
                  {pri?.label ?? a.priority}
                </Badge>
                <Badge color={cat?.color ?? "#64748b"}>
                  {cat?.label ?? a.category}
                </Badge>
                <button
                  type="button"
                  onClick={() => setActions((p) => p.filter((_, j) => j !== i))}
                  className="text-slate-300 hover:text-[var(--c-red)] opacity-0 group-hover:opacity-100"
                >
                  <XIcon className="h-3 w-3" />
                </button>
              </li>
            );
          })}
        </ul>

        <div className="mt-2 space-y-2 rounded-lg border bg-slate-50/60 p-2">
          <Input
            value={actionDraft}
            onChange={(e) => setActionDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                addAction();
              }
            }}
            placeholder="Add an action item…"
            className="!h-8 !text-sm"
          />
          <div className="grid grid-cols-3 gap-2">
            <Input
              type="date"
              value={actionDue}
              onChange={(e) => setActionDue(e.target.value)}
              className="!h-8 !text-xs"
              title="Deadline (optional)"
            />
            <Select
              value={actionPriority}
              onChange={(e) => setActionPriority(e.target.value)}
              className="!h-8 !text-xs"
              title="Priority"
            >
              {PRIORITIES.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.label}
                </option>
              ))}
            </Select>
            <Select
              value={actionCategory}
              onChange={(e) => setActionCategory(e.target.value)}
              className="!h-8 !text-xs"
              title="Category"
            >
              {CATEGORIES.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.label}
                </option>
              ))}
            </Select>
          </div>
          <div className="flex items-center justify-between gap-2">
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={addAction}
              disabled={!actionDraft.trim()}
            >
              <Plus className="h-3.5 w-3.5" /> Add item
            </Button>
            <Button
              type="button"
              size="sm"
              variant="brand"
              onClick={createTasks}
              disabled={actions.length === 0}
            >
              Create {actions.length || ""} task{actions.length === 1 ? "" : "s"}
            </Button>
          </div>
        </div>
        <p className="text-[10px] text-slate-400 mt-1">
          Tasks are created for this meeting&apos;s student with the deadline,
          priority and category you set here. Open the{" "}
          <span className="font-medium">Task panel</span> afterwards to add a
          description, subtasks, comments, and more.
        </p>
      </div>
    </div>
  );
}

function MyAvailabilityDialog({
  open,
  onOpenChange,
  initial,
}: {
  open: boolean;
  onOpenChange: (b: boolean) => void;
  initial: { id: string; startsAt: string; endsAt: string; label: string | null; kind: string }[];
}) {
  const router = useRouter();
  const [items, setItems] = useState(initial);
  const [start, setStart] = useState("");
  const [end, setEnd] = useState("");
  const [label, setLabel] = useState("");
  const [busy, setBusy] = useState(false);

  async function add() {
    if (!start || !end) return;
    setBusy(true);
    const r = await fetch("/api/availability", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        startsAt: new Date(start).toISOString(),
        endsAt: new Date(end).toISOString(),
        label: label.trim() || null,
      }),
    });
    setBusy(false);
    if (r.ok) {
      const { item } = await r.json();
      setItems((p) => [...p, item]);
      setStart("");
      setEnd("");
      setLabel("");
      router.refresh();
    }
  }
  async function remove(id: string) {
    setItems((p) => p.filter((i) => i.id !== id));
    await fetch(`/api/availability/${id}`, { method: "DELETE" });
    router.refresh();
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>My availability</DialogTitle>
        </DialogHeader>
        <p className="text-[11px] text-slate-500 mb-3">
          Mark periods you&apos;re away (travel, leave, holidays). Your students
          see an opaque <strong>&ldquo;Unavailable&rdquo;</strong> block on those
          days — never your label. This isn&apos;t a weekly chore; just add
          periods as they come up.
        </p>
        <div className="space-y-2">
          <div className="grid grid-cols-2 gap-2">
            <Field label="From">
              <Input
                type="date"
                value={start}
                onChange={(e) => setStart(e.target.value)}
              />
            </Field>
            <Field label="To">
              <Input
                type="date"
                value={end}
                onChange={(e) => setEnd(e.target.value)}
              />
            </Field>
          </div>
          <Field label="Label (only you see this)">
            <Input
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              placeholder="Conference, annual leave…"
            />
          </Field>
          <div className="flex justify-end">
            <Button
              type="button"
              variant="brand"
              onClick={add}
              disabled={busy || !start || !end}
            >
              <Plus className="h-4 w-4" /> Add period
            </Button>
          </div>
        </div>
        {items.length > 0 && (
          <ul className="mt-4 space-y-1.5 border-t pt-3">
            {items.map((i) => (
              <li
                key={i.id}
                className="flex items-center justify-between gap-2 text-sm"
              >
                <span className="text-slate-700">
                  {format(new Date(i.startsAt), "MMM d")} –{" "}
                  {format(new Date(i.endsAt), "MMM d, yyyy")}
                  {i.label ? (
                    <span className="text-slate-400"> · {i.label}</span>
                  ) : null}
                </span>
                <button
                  type="button"
                  onClick={() => remove(i.id)}
                  className="text-slate-300 hover:text-[var(--c-red)]"
                  title="Remove"
                >
                  <XIcon className="h-3.5 w-3.5" />
                </button>
              </li>
            ))}
          </ul>
        )}
      </DialogContent>
    </Dialog>
  );
}

// ─── Week / Day time grid ──────────────────────────────────────────────────
// Full 24h so all hours are reachable regardless of viewport size.
// On tall windows the 07–22 default hid early hours entirely (no
// content to scroll to). Auto-scroll-on-mount lands users at 8 AM
// (or the current hour today), so they don't have to scroll to find
// the typical workday.
const FIRST_HOUR = 0;
const LAST_HOUR = 23;
const HOUR_PX = 56;
const HOURS = Array.from(
  { length: LAST_HOUR - FIRST_HOUR + 1 },
  (_, i) => FIRST_HOUR + i,
);

function TimeGrid({
  cursor,
  view,
  events,
  availabilityByDay,
  holidaysByDay,
  effectiveKind,
  onEventClick,
  onSlotClick,
  onAvailClick,
}: {
  cursor: Date;
  view: "week" | "day";
  events: Event[];
  availabilityByDay: Record<string, { who: string; label: string | null }[]>;
  holidaysByDay: Map<string, string>;
  effectiveKind: (id: string) => "new" | "updated" | null;
  onEventClick: (id: string) => void;
  onSlotClick: (day: Date) => void;
  onAvailClick: (day: Date) => void;
}) {
  const days =
    view === "day"
      ? [startOfDay(cursor)]
      : eachDayOfInterval({
          start: startOfWeek(cursor, { weekStartsOn: 1 }),
          end: endOfWeek(cursor, { weekStartsOn: 1 }),
        });

  // Two passes — all-day events go in a strip above the hour grid,
  // timed events go in their hour slot. Without the split, all-day
  // task/sub-task mirrors (anchored at noon UTC) showed up at 14:00
  // CEST in the body and were impossible to spot.
  const allDayByDay = useMemo(() => {
    const map: Record<string, Event[]> = {};
    for (const e of events) {
      if (!e.allDay) continue;
      const key = format(new Date(e.startsAt), "yyyy-MM-dd");
      (map[key] ??= []).push(e);
    }
    return map;
  }, [events]);
  const eventsByDay = useMemo(() => {
    const map: Record<string, Event[]> = {};
    for (const e of events) {
      if (e.allDay) continue;
      const key = format(new Date(e.startsAt), "yyyy-MM-dd");
      (map[key] ??= []).push(e);
    }
    return map;
  }, [events]);
  // True when ANY day in the visible range has at least one all-day
  // item — used to conditionally render the all-day strip so it
  // doesn't take up space on empty weeks.
  const anyAllDay = Object.values(allDayByDay).some((arr) => arr.length > 0);

  // Auto-scroll the body to the current hour (or 8 AM if "now" is
  // outside the visible range). Runs once on mount per view/cursor
  // change so users land on relevant content without needing to
  // scroll the inner container themselves — which was reported as
  // unintuitive on smaller screens.
  const bodyRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const now = new Date();
    const isToday = days.some((d) => isSameDay(d, now));
    const targetHour = isToday
      ? Math.max(FIRST_HOUR, Math.min(LAST_HOUR, now.getHours() - 1))
      : 8;
    const offset = (targetHour - FIRST_HOUR) * HOUR_PX;
    bodyRef.current?.scrollTo({ top: offset, behavior: "auto" });
  }, [cursor, view, days.length, days]);

  return (
    <div className="flex flex-col flex-1 overflow-hidden">
      {/* Header */}
      <div
        className="grid border-b bg-slate-50"
        style={{
          gridTemplateColumns: `48px repeat(${days.length}, minmax(0, 1fr))`,
        }}
      >
        <div className="border-r" />
        {days.map((d) => {
          const today = isSameDay(d, new Date());
          const dKey = format(d, "yyyy-MM-dd");
          const unavail = availabilityByDay[dKey] ?? [];
          const holidayName = holidaysByDay.get(dKey);
          return (
            <div
              key={d.toISOString()}
              className={cn(
                "px-2 py-2 text-center border-r",
                holidayName && "bg-rose-50/60",
              )}
            >
              <div className="text-[10px] uppercase font-semibold text-slate-500">
                {format(d, "EEE")}
              </div>
              <div
                className={cn(
                  "mt-0.5 inline-flex h-7 w-7 items-center justify-center rounded-full text-sm font-bold",
                  today ? "bg-[var(--c-violet)] text-white" : "text-slate-700",
                )}
              >
                {format(d, "d")}
              </div>
              {holidayName && (
                <div
                  className="mt-1 truncate rounded-full bg-rose-100 px-1.5 py-0.5 text-[10px] font-semibold uppercase text-rose-700"
                  title={`Public holiday — ${holidayName} · Sevilla`}
                >
                  🎉 {holidayName}
                </div>
              )}
              {unavail.length > 0 && (
                <button
                  type="button"
                  onClick={() => onAvailClick(d)}
                  className="mt-1 block w-full truncate rounded bg-slate-200 px-1.5 py-0.5 text-[10px] font-medium text-slate-600 hover:bg-slate-300"
                >
                  ⊘{" "}
                  {unavail.length === 1
                    ? `${unavail[0]!.who} away`
                    : `${unavail.length} supervisors away`}
                </button>
              )}
            </div>
          );
        })}
      </div>

      {/* All-day strip — only shown when something fills it */}
      {anyAllDay && (
        <div
          className="grid border-b bg-white"
          style={{
            gridTemplateColumns: `48px repeat(${days.length}, minmax(0, 1fr))`,
          }}
        >
          <div className="border-r flex items-start justify-end p-1">
            <span className="text-[9px] uppercase font-semibold tracking-wide text-slate-400">
              all
            </span>
          </div>
          {days.map((d) => {
            const key = format(d, "yyyy-MM-dd");
            const items = allDayByDay[key] ?? [];
            return (
              <div
                key={d.toISOString()}
                className="min-h-[28px] border-r p-1 space-y-0.5"
              >
                {items.map((e) => {
                  const isTask = !!e.ticketId;
                  const isSubtask = !!e.subtaskParentId;
                  const kind = effectiveKind(e.id);
                  return (
                    <button
                      key={e.id}
                      onClick={(ev) => {
                        ev.stopPropagation();
                        onEventClick(e.id);
                      }}
                      className={cn(
                        "block w-full truncate rounded px-1.5 py-0.5 text-left text-[11px] font-medium",
                        isTask || isSubtask
                          ? "border bg-white text-slate-700"
                          : "border-l-2",
                        isSubtask && "border-dashed",
                        kind === "new" && "ring-2 ring-[var(--c-red)]",
                        kind === "updated" && "ring-2 ring-[var(--c-blue)]",
                      )}
                      style={
                        isTask || isSubtask
                          ? undefined
                          : {
                              background: `${e.student?.color ?? "#6366f1"}1f`,
                              color: e.student?.color ?? "#6366f1",
                              borderLeftColor: e.student?.color ?? "#6366f1",
                            }
                      }
                      title={e.title}
                    >
                      {e.title}
                    </button>
                  );
                })}
              </div>
            );
          })}
        </div>
      )}

      {/* Body */}
      <div
        ref={bodyRef}
        // `min-h-0` is the classic flex+overflow scroll-fix: without
        // it, this child refuses to shrink below the natural height
        // of its inner grid (HOURS.length * HOUR_PX), and the
        // browser's scroll never engages on viewports where the
        // calendar should normally scroll.
        // `overscroll-contain` keeps inner scroll from chaining out
        // to the page when the user reaches the top/bottom — common
        // gripe on trackpads when scroll bleeds into the URL bar.
        className="relative flex-1 min-h-0 overflow-y-auto overscroll-contain"
      >
        <div
          className="relative grid"
          style={{
            gridTemplateColumns: `48px repeat(${days.length}, minmax(0, 1fr))`,
            height: HOURS.length * HOUR_PX,
          }}
        >
          {/* Time gutter */}
          <div className="relative border-r">
            {HOURS.map((h, i) => (
              <div
                key={h}
                className="absolute right-1 text-[10px] text-slate-400 font-semibold leading-none"
                style={{ top: i * HOUR_PX - 4 }}
              >
                {h.toString().padStart(2, "0")}:00
              </div>
            ))}
          </div>

          {/* Day columns */}
          {days.map((d) => {
            const key = format(d, "yyyy-MM-dd");
            const dayEvs = eventsByDay[key] ?? [];
            return (
              <div
                key={d.toISOString()}
                className="relative border-r"
                onClick={(e) => {
                  if (e.target === e.currentTarget) onSlotClick(d);
                }}
              >
                {/* hour grid lines */}
                {HOURS.map((_, i) => (
                  <div
                    key={i}
                    className="absolute inset-x-0 border-t border-slate-100"
                    style={{ top: i * HOUR_PX }}
                  />
                ))}
                {/* now-line */}
                {isSameDay(d, new Date()) && <NowLine />}
                {/* events (overlaps packed into side-by-side columns) */}
                {(() => {
                  const laid = layoutDay(dayEvs);
                  return dayEvs.map((ev, idx) => {
                  const layout = laid[idx];
                  if (!layout) return null;
                  const kind = effectiveKind(ev.id);
                  const baseBg = `${ev.student?.color ?? "#6366f1"}26`;
                  const baseBorder = ev.student?.color ?? "#6366f1";
                  return (
                    <button
                      key={`${ev.id}-${idx}`}
                      onClick={(e) => {
                        e.stopPropagation();
                        onEventClick(ev.id);
                      }}
                      className={cn(
                        "absolute rounded-md p-1.5 text-left text-[11px] font-medium overflow-hidden hover:shadow-md hover:z-20 transition-shadow",
                        kind === "new" && "ring-2 ring-[var(--c-red)] animate-pulse-red",
                        kind === "updated" && "ring-2 ring-[var(--c-blue)] animate-pulse-blue",
                      )}
                      style={{
                        top: layout.top,
                        height: layout.height,
                        left: `calc(${layout.leftPct}% + 2px)`,
                        width: `calc(${layout.widthPct}% - 4px)`,
                        background:
                          kind === "new" ? "#fee2e2" : kind === "updated" ? "#dbeafe" : baseBg,
                        color: ev.student?.color ?? "#6366f1",
                        borderLeft: `3px solid ${baseBorder}`,
                      }}
                      title={`${ev.title} (${format(new Date(ev.startsAt), "HH:mm")}–${format(new Date(ev.endsAt), "HH:mm")})`}
                    >
                      {kind && (
                        <span
                          className={cn(
                            "inline-flex items-center rounded-full px-1 mr-1 text-[8px] font-bold uppercase text-white align-middle",
                            kind === "new" ? "bg-[var(--c-red)]" : "bg-[var(--c-blue)]",
                          )}
                        >
                          {kind === "new" ? "new" : "upd"}
                        </span>
                      )}
                      <div className="font-semibold truncate text-slate-900 inline">
                        {ev.title}
                      </div>
                      <div className="text-[10px] opacity-80">
                        {format(new Date(ev.startsAt), "HH:mm")} –{" "}
                        {format(new Date(ev.endsAt), "HH:mm")}
                      </div>
                      {ev.student && (
                        <div
                          className="text-[10px] truncate"
                          style={{ color: ev.student.color }}
                        >
                          {displayName(ev.student)}
                        </div>
                      )}
                    </button>
                  );
                  });
                })()}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function layoutEvent(ev: Event): { top: number; height: number } | null {
  const start = new Date(ev.startsAt);
  const end = new Date(ev.endsAt);
  const startMinutes = start.getHours() * 60 + start.getMinutes() - FIRST_HOUR * 60;
  const endMinutes = end.getHours() * 60 + end.getMinutes() - FIRST_HOUR * 60;
  if (endMinutes <= 0) return null;
  const top = Math.max(0, (startMinutes / 60) * HOUR_PX);
  const bottom = Math.min((LAST_HOUR - FIRST_HOUR + 1) * HOUR_PX, (endMinutes / 60) * HOUR_PX);
  const height = Math.max(22, bottom - top);
  return { top, height };
}

type Placed = {
  top: number;
  height: number;
  leftPct: number;
  widthPct: number;
} | null;

/**
 * Pack a day's events into side-by-side columns so overlapping events sit
 * next to each other instead of stacking into an unreadable pile. Returns
 * an array aligned with the input (null = not visible in the window).
 */
function layoutDay(evs: Event[]): Placed[] {
  const items = evs
    .map((ev, i) => {
      const l = layoutEvent(ev);
      return l ? { i, top: l.top, height: l.height, end: l.top + l.height } : null;
    })
    .filter((x): x is { i: number; top: number; height: number; end: number } => !!x)
    .sort((a, b) => a.top - b.top || a.end - b.end);

  const result: Placed[] = new Array(evs.length).fill(null);
  let cluster: { i: number; top: number; end: number; height: number }[] = [];
  let clusterEnd = -1;

  const flush = () => {
    if (cluster.length === 0) return;
    const colEnds: number[] = []; // last visual end per column
    const colOf = new Map<number, number>();
    for (const it of cluster) {
      let col = colEnds.findIndex((e) => e <= it.top + 0.01);
      if (col === -1) {
        col = colEnds.length;
        colEnds.push(it.end);
      } else {
        colEnds[col] = it.end;
      }
      colOf.set(it.i, col);
    }
    const n = colEnds.length;
    for (const it of cluster) {
      const col = colOf.get(it.i)!;
      result[it.i] = {
        top: it.top,
        height: it.height,
        leftPct: (col * 100) / n,
        widthPct: 100 / n,
      };
    }
    cluster = [];
    clusterEnd = -1;
  };

  for (const it of items) {
    if (cluster.length > 0 && it.top >= clusterEnd) flush();
    cluster.push(it);
    clusterEnd = Math.max(clusterEnd, it.end);
  }
  flush();
  return result;
}

function NowLine() {
  const [now, setNow] = useState(new Date());
  // light auto-refresh once a minute
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 60_000);
    return () => clearInterval(t);
  }, []);
  const minutes = now.getHours() * 60 + now.getMinutes() - FIRST_HOUR * 60;
  if (minutes < 0 || minutes > (LAST_HOUR - FIRST_HOUR + 1) * 60) return null;
  const top = (minutes / 60) * HOUR_PX;
  return (
    <div
      className="absolute left-0 right-0 pointer-events-none z-10"
      style={{ top }}
    >
      <div className="h-px bg-[var(--c-red)]" />
      <div className="absolute -left-1 -top-1 h-2 w-2 rounded-full bg-[var(--c-red)]" />
    </div>
  );
}

function YearGrid({
  year,
  events,
  availabilityByDay,
  holidaysByDay,
  onPickDay,
}: {
  year: number;
  events: Event[];
  availabilityByDay: Record<string, { who: string; label: string | null }[]>;
  holidaysByDay: Map<string, string>;
  onPickDay: (day: Date) => void;
}) {
  // Bucket events by yyyy-MM-dd for fast lookup.
  const byDay = useMemo(() => {
    const m: Record<string, Event[]> = {};
    for (const e of events) {
      const d = new Date(e.startsAt);
      if (d.getFullYear() !== year) continue;
      const key = format(d, "yyyy-MM-dd");
      (m[key] ??= []).push(e);
    }
    return m;
  }, [events, year]);

  const months = Array.from({ length: 12 }, (_, i) => new Date(year, i, 1));
  const today = new Date();

  return (
    <div className="flex-1 overflow-auto p-4 lg:p-6">
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
        {months.map((monthDate) => {
          const start = startOfWeek(startOfMonth(monthDate), { weekStartsOn: 1 });
          const end = endOfWeek(endOfMonth(monthDate), { weekStartsOn: 1 });
          const days = eachDayOfInterval({ start, end });
          return (
            <div
              key={monthDate.getMonth()}
              className="rounded-xl border bg-white p-3"
            >
              <div className="text-xs font-bold text-slate-700 mb-2 uppercase tracking-wide">
                {format(monthDate, "MMMM")}
              </div>
              <div className="grid grid-cols-7 text-[9px] text-slate-400 mb-1">
                {["M", "T", "W", "T", "F", "S", "S"].map((d, i) => (
                  <div key={i} className="text-center">
                    {d}
                  </div>
                ))}
              </div>
              <div className="grid grid-cols-7 gap-y-0.5">
                {days.map((day) => {
                  const key = format(day, "yyyy-MM-dd");
                  const evs = byDay[key] ?? [];
                  const unavailable = (availabilityByDay[key]?.length ?? 0) > 0;
                  const inMonth = isSameMonth(day, monthDate);
                  const isToday = isSameDay(day, today);
                  const hasTask = evs.some((e) => e.ticketId);
                  const holidayName = holidaysByDay.get(key);
                  return (
                    <button
                      key={key}
                      type="button"
                      onClick={() => onPickDay(day)}
                      className={cn(
                        "flex flex-col items-center justify-start h-7 rounded text-[10px] hover:bg-slate-100",
                        !inMonth && "text-slate-300",
                        inMonth && !isToday && "text-slate-700",
                        isToday && "bg-[var(--c-violet)] text-white font-bold hover:bg-[var(--c-violet)]",
                        unavailable && !isToday && "bg-slate-200/70",
                        // Mini-cal: subtle rose tint on holiday days
                        // so they're spottable at a glance without a
                        // text label (no room for one in 7px wide).
                        holidayName && !isToday && "bg-rose-100/70 text-rose-700",
                      )}
                      title={
                        holidayName
                          ? `${format(day, "MMM d")} · 🎉 ${holidayName} · Sevilla`
                          : unavailable
                            ? `${format(day, "MMM d")} · ${(availabilityByDay[key] ?? [])
                                .map((a) => a.who)
                                .join(", ")} away`
                            : evs.length > 0
                              ? `${format(day, "MMM d")} · ${evs.length} item${evs.length === 1 ? "" : "s"}`
                              : format(day, "MMM d")
                      }
                    >
                      <span className="leading-none mt-0.5">{format(day, "d")}</span>
                      {evs.length > 0 && (
                        <span className="flex gap-px mt-0.5">
                          {evs.slice(0, 3).map((e, i) => (
                            <span
                              key={i}
                              className="block h-1 w-1 rounded-full"
                              style={{
                                background: e.ticketId
                                  ? taskPriorityColor(e.taskPriority)
                                  : e.student?.color ?? "#6366f1",
                              }}
                            />
                          ))}
                          {evs.length > 3 && (
                            <span
                              className="block h-1 w-1 rounded-full bg-slate-400"
                              title={`+${evs.length - 3} more`}
                            />
                          )}
                        </span>
                      )}
                      {hasTask && evs.length === 0 && null}
                    </button>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
