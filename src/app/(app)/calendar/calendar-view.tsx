"use client";
import { useEffect, useMemo, useState } from "react";
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
import { ChevronLeft, ChevronRight, Plus, RefreshCw, ExternalLink, MapPin, Video, Trash2, Clock, Users as UsersIcon, X as XIcon } from "lucide-react";
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
import { useRouter } from "next/navigation";
import { openCalendarUrl } from "@/components/google-calendar-picker";
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
  student: { id: string; fullName: string; alias: string | null; color: string } | null;
  googleEventId: string | null;
  googleCalendarId: string | null;
  ticketId: string | null;
  taskPriority: string | null;
  recurring?: boolean; // synthetic occurrence flag (client-only)
}

export function CalendarView({
  viewerRole,
  viewerStudentId,
  students,
  events: initial,
  initialStudent,
  highlightByEvent: initialHighlights,
}: {
  viewerRole: string;
  viewerStudentId: string | null;
  students: Student[];
  events: Event[];
  initialStudent: string | null;
  initialMonth: string | null;
  highlightByEvent?: Record<string, "new" | "updated">;
}) {
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
  const [selectedDay, setSelectedDay] = useState<Date | null>(null);
  const [syncing, setSyncing] = useState(false);
  const [openEventId, setOpenEventId] = useState<string | null>(null);
  const [view, setView] = useState<"year" | "month" | "week" | "day">("month");
  const [recentlyDeleted, setRecentlyDeleted] = useState<Event[]>([]);
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
    const base = events.filter(
      (e) => !studentFilter || e.student?.id === studentFilter,
    );
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

  // Poll for events + highlight changes so the calendar updates without
  // requiring the user to leave and come back. Skips while a dialog is open.
  useEffect(() => {
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | null = null;

    async function tick() {
      if (!newOpen && !openEventId) {
        // Pull a window around the cursor. Year view needs the whole year;
        // other views use the 3-month context (matches the page-load query).
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
        try {
          const r = await fetch(`/api/calendar/events/list?${params.toString()}`, {
            cache: "no-store",
          });
          if (!cancelled && r.ok) {
            const j = await r.json();
            setEvents((prev) => {
              const newIds = new Set<string>(j.events.map((e: Event) => e.id));
              const gone = prev.filter((e) => !newIds.has(e.id));
              if (gone.length > 0) {
                setRecentlyDeleted((rd) => {
                  const have = new Set(rd.map((e) => e.id));
                  return [...rd, ...gone.filter((e) => !have.has(e.id))];
                });
              }
              return j.events;
            });
            setHighlightByEvent(j.highlightByEvent ?? {});
          }
        } catch {
          // ignore transient errors
        }
      }
      if (!cancelled) timer = setTimeout(tick, 8000);
    }
    // First tick: fire immediately so view/cursor changes show fresh data.
    tick();
    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
    };
  }, [cursor, newOpen, openEventId, studentFilter, view]);

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

  const upcoming = filtered
    .filter((e) => new Date(e.startsAt) >= new Date())
    .slice(0, 8);

  return (
    <div className="flex flex-col h-[calc(100vh-4rem)]">
      <div className="flex items-center justify-between gap-4 flex-wrap px-6 lg:px-8 py-4 border-b bg-white">
        <div className="flex items-center gap-3">
          <Button size="icon" variant="ghost" onClick={goPrev}>
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <h1 className="text-xl lg:text-2xl font-bold text-slate-900 min-w-[200px] text-center">
            {headerLabel}
          </h1>
          <Button size="icon" variant="ghost" onClick={goNext}>
            <ChevronRight className="h-4 w-4" />
          </Button>
          <Button size="sm" variant="outline" onClick={() => setCursor(new Date())}>
            Today
          </Button>
          <div className="flex rounded-lg border bg-slate-50 p-0.5 ml-2">
            {(["year", "month", "week", "day"] as const).map((v) => (
              <button
                key={v}
                type="button"
                onClick={() => setView(v)}
                className={cn(
                  "px-3 py-1 text-xs font-semibold rounded-md transition-colors",
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
              <option value="">All students</option>
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
          <Button variant="brand" onClick={() => setNewOpen(true)}>
            <Plus className="h-4 w-4" /> New event
          </Button>
        </div>
      </div>

      {noSharedCalendar && activeStudent && (
        <div className="border-b bg-amber-50 px-6 lg:px-8 py-3 flex items-start sm:items-center gap-3 flex-wrap">
          <AlertCircle className="h-5 w-5 text-amber-700 shrink-0 mt-0.5 sm:mt-0" />
          <div className="flex-1 min-w-0 text-sm text-amber-900">
            <strong>{displayName(activeStudent)}</strong> doesn&apos;t have a
            shared Google Calendar yet.{" "}
            {isStudent
              ? "Create one and your supervisors will be granted writer access automatically."
              : "Ask the student to create a shared calendar from their profile so events created here land directly on it."}
          </div>
          {isStudent && (
            <CalendarShareButton
              studentId={activeStudent.id}
              hasCalendar={false}
            />
          )}
        </div>
      )}

      <div className="flex-1 grid grid-cols-1 xl:grid-cols-[1fr_320px] gap-0 overflow-hidden">
        <div className="flex flex-col overflow-hidden">
          {view === "year" && (
            <YearGrid
              year={cursor.getFullYear()}
              events={filtered}
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
              <div className="grid grid-cols-7 grid-rows-6 flex-1 overflow-y-auto">
                {days.map((day) => {
                  const key = format(day, "yyyy-MM-dd");
                  const evs = dayEvents[key] ?? [];
                  const ghosts = deletedByDay[key] ?? [];
                  const inMonth = isSameMonth(day, cursor);
                  const today = isSameDay(day, new Date());
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
                        "cursor-pointer text-left border-b border-r p-2 min-h-[110px] hover:bg-slate-50 transition-colors group",
                        !inMonth && "bg-slate-50/50",
                      )}
                    >
                      <div
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
                      </div>
                      <div className="mt-1 space-y-1">
                        {evs.slice(0, 3).map((e) => {
                          const kind = effectiveKind(e.id);
                          const isTask = !!e.ticketId;
                          if (isTask) {
                            const pColor = taskPriorityColor(e.taskPriority);
                            const cleanTitle = e.title.replace(/^\[Task\]\s*/, "");
                            return (
                              <button
                                key={e.id}
                                onClick={(ev) => {
                                  ev.stopPropagation();
                                  dismissEvent(e.id);
                                  router.push(`/kanban?ticket=${e.ticketId}`);
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
                              {format(new Date(e.startsAt), "HH:mm")} {e.title}
                            </button>
                          );
                        })}
                        {evs.length > 3 && (
                          <div className="text-[10px] text-slate-500 pl-1">
                            +{evs.length - 3} more
                          </div>
                        )}
                        {ghosts.map((e) => {
                          const cleanTitle = e.title.replace(/^\[Task\]\s*/, "");
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
              effectiveKind={effectiveKind}
              onEventClick={(id) => {
                setOpenEventId(id);
                dismissEvent(id);
              }}
              onSlotClick={(day) => {
                setSelectedDay(day);
                setNewOpen(true);
              }}
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
                <li
                  key={e.id}
                  onClick={() => {
                    dismissEvent(e.id);
                    if (e.ticketId) {
                      router.push(`/kanban?ticket=${e.ticketId}`);
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
                        {format(new Date(e.startsAt), "EEE MMM d · HH:mm")}
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
        onOpenChange={(o) => !o && setOpenEventId(null)}
        onDeleted={(id) => {
          setEvents((prev) => prev.filter((e) => e.id !== id));
          setOpenEventId(null);
        }}
      />
    </div>
  );
}

function EventDetailDialog({
  event,
  open,
  onOpenChange,
  onDeleted,
}: {
  event: Event | null;
  open: boolean;
  onOpenChange: (b: boolean) => void;
  onDeleted: (id: string) => void;
}) {
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);
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
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="!max-w-md">
        <DialogHeader>
          <DialogTitle>{event.title}</DialogTitle>
        </DialogHeader>

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
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            Close
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function NewEventDialog({
  open,
  onOpenChange,
  students,
  defaultDate,
  defaultStudentId,
  isStudent,
  onCreated,
}: {
  open: boolean;
  onOpenChange: (b: boolean) => void;
  students: Student[];
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
    payload.pushToGoogle = pushGoogle ? "1" : "";
    const rrule = buildRRule(recurFreq, recurInterval, recurUntil || null);
    if (rrule) payload.recurrenceRule = rrule;
    const r = await fetch("/api/calendar/events", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
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
            <Field label="Student">
              <Select name="studentId" defaultValue={defaultStudentId ?? ""}>
                <option value="">No specific student</option>
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
          <Field label="Description (optional)">
            <Textarea name="description" rows={2} />
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

// ─── Week / Day time grid ──────────────────────────────────────────────────
const FIRST_HOUR = 7;
const LAST_HOUR = 22;
const HOUR_PX = 56;
const HOURS = Array.from(
  { length: LAST_HOUR - FIRST_HOUR + 1 },
  (_, i) => FIRST_HOUR + i,
);

function TimeGrid({
  cursor,
  view,
  events,
  effectiveKind,
  onEventClick,
  onSlotClick,
}: {
  cursor: Date;
  view: "week" | "day";
  events: Event[];
  effectiveKind: (id: string) => "new" | "updated" | null;
  onEventClick: (id: string) => void;
  onSlotClick: (day: Date) => void;
}) {
  const days =
    view === "day"
      ? [startOfDay(cursor)]
      : eachDayOfInterval({
          start: startOfWeek(cursor, { weekStartsOn: 1 }),
          end: endOfWeek(cursor, { weekStartsOn: 1 }),
        });

  const eventsByDay = useMemo(() => {
    const map: Record<string, Event[]> = {};
    for (const e of events) {
      const key = format(new Date(e.startsAt), "yyyy-MM-dd");
      (map[key] ??= []).push(e);
    }
    return map;
  }, [events]);

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
          return (
            <div
              key={d.toISOString()}
              className="px-2 py-2 text-center border-r"
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
            </div>
          );
        })}
      </div>

      {/* Body */}
      <div className="relative flex-1 overflow-y-auto">
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
                {/* events */}
                {dayEvs.map((ev) => {
                  const layout = layoutEvent(ev);
                  if (!layout) return null;
                  const kind = effectiveKind(ev.id);
                  const baseBg = `${ev.student?.color ?? "#6366f1"}26`;
                  const baseBorder = ev.student?.color ?? "#6366f1";
                  return (
                    <button
                      key={ev.id}
                      onClick={(e) => {
                        e.stopPropagation();
                        onEventClick(ev.id);
                      }}
                      className={cn(
                        "absolute left-1 right-1 rounded-md p-1.5 text-left text-[11px] font-medium overflow-hidden hover:shadow-md transition-shadow",
                        kind === "new" && "ring-2 ring-[var(--c-red)] animate-pulse-red",
                        kind === "updated" && "ring-2 ring-[var(--c-blue)] animate-pulse-blue",
                      )}
                      style={{
                        top: layout.top,
                        height: layout.height,
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
                })}
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
  onPickDay,
}: {
  year: number;
  events: Event[];
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
                  const inMonth = isSameMonth(day, monthDate);
                  const isToday = isSameDay(day, today);
                  const hasTask = evs.some((e) => e.ticketId);
                  return (
                    <button
                      key={key}
                      type="button"
                      onClick={() => onPickDay(day)}
                      title={
                        evs.length > 0
                          ? `${format(day, "MMM d")} · ${evs.length} item${evs.length === 1 ? "" : "s"}`
                          : format(day, "MMM d")
                      }
                      className={cn(
                        "flex flex-col items-center justify-start h-7 rounded text-[10px] hover:bg-slate-100",
                        !inMonth && "text-slate-300",
                        inMonth && !isToday && "text-slate-700",
                        isToday && "bg-[var(--c-violet)] text-white font-bold hover:bg-[var(--c-violet)]",
                      )}
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
