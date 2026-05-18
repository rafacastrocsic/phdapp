"use client";
import { useMemo } from "react";
import { format } from "date-fns";
import type { Ticket } from "./kanban-board";
import { statusColor } from "@/lib/kanban-constants";
import { displayName } from "@/lib/utils";

type StudentLite = {
  id: string;
  fullName: string;
  alias: string | null;
  color: string;
};

const DAY = 86_400_000;

function startOf(t: Ticket): number {
  const c = t.createdAt ? new Date(t.createdAt).getTime() : Date.now();
  return c;
}
function endOf(t: Ticket): number {
  const s = startOf(t);
  if (!t.dueDate) return s;
  const d = new Date(t.dueDate).getTime();
  return d > s ? d : s;
}

/**
 * Lightweight dependency-aware Gantt: one row per task (start = created,
 * end = due date), grouped by student, with a "today" line. No external
 * lib — a positioned-bar timeline. Click a bar to open the task.
 */
export function GanttView({
  tickets,
  students,
  onOpen,
}: {
  tickets: Ticket[];
  students: StudentLite[];
  onOpen: (id: string) => void;
}) {
  const range = useMemo(() => {
    const now = Date.now();
    let min = now;
    let max = now;
    for (const t of tickets) {
      min = Math.min(min, startOf(t));
      max = Math.max(max, endOf(t));
    }
    min -= 3 * DAY;
    max += 3 * DAY;
    if (max - min < 14 * DAY) max = min + 14 * DAY;
    return { min, max, span: max - min };
  }, [tickets]);

  const ticks = useMemo(() => {
    const out: { left: number; label: string }[] = [];
    const d = new Date(range.min);
    d.setHours(0, 0, 0, 0);
    // Weekly gridlines.
    d.setDate(d.getDate() + ((8 - d.getDay()) % 7)); // next Monday
    for (let i = 0; i < 60; i++) {
      const ts = d.getTime();
      if (ts > range.max) break;
      out.push({
        left: ((ts - range.min) / range.span) * 100,
        label: format(d, "MMM d"),
      });
      d.setDate(d.getDate() + 7);
    }
    return out;
  }, [range]);

  const byStudent = useMemo(() => {
    const m: Record<string, Ticket[]> = {};
    for (const t of tickets) (m[t.student.id] ??= []).push(t);
    return students
      .map((s) => ({
        student: s,
        tickets: (m[s.id] ?? []).sort((a, b) => startOf(a) - startOf(b)),
      }))
      .filter((g) => g.tickets.length > 0);
  }, [tickets, students]);

  const titleById = useMemo(() => {
    const m: Record<string, string> = {};
    for (const t of tickets) m[t.id] = t.title;
    return m;
  }, [tickets]);

  if (byStudent.length === 0) {
    return (
      <div className="flex-1 flex items-center justify-center text-sm text-slate-400">
        No tasks match the current filters.
      </div>
    );
  }

  const todayLeft = ((Date.now() - range.min) / range.span) * 100;
  const LABEL_W = "16rem";

  return (
    <div className="flex-1 min-w-0 overflow-auto p-6 lg:p-8 space-y-6">
      <p className="text-xs text-slate-500">
        Each bar runs from when the task was created to its due date. The
        dashed line is today; ⛓ marks tasks with dependencies.
      </p>
      {byStudent.map((g) => (
        <section key={g.student.id} className="space-y-1.5">
          <div className="flex items-center gap-2">
            <span
              className="h-3 w-3 rounded-full"
              style={{ background: g.student.color }}
            />
            <h2 className="text-sm font-bold text-slate-900">
              {displayName(g.student)}
            </h2>
          </div>
          <div className="overflow-hidden rounded-xl border bg-white">
            {/* Header ticks */}
            <div
              className="relative h-7 border-b bg-slate-50"
              style={{ marginLeft: LABEL_W }}
            >
              {ticks.map((tk, i) => (
                <div
                  key={i}
                  className="absolute top-0 h-full border-l border-slate-200"
                  style={{ left: `${tk.left}%` }}
                >
                  <span className="pl-1 text-[10px] text-slate-400">
                    {tk.label}
                  </span>
                </div>
              ))}
              {todayLeft >= 0 && todayLeft <= 100 && (
                <div
                  className="absolute top-0 h-full border-l-2 border-dashed border-[var(--c-red)]"
                  style={{ left: `${todayLeft}%` }}
                />
              )}
            </div>
            <ul>
              {g.tickets.map((t) => {
                const s = startOf(t);
                const e = endOf(t);
                const left = ((s - range.min) / range.span) * 100;
                const width = Math.max(
                  1.5,
                  ((e - s) / range.span) * 100,
                );
                const overdue =
                  t.dueDate &&
                  new Date(t.dueDate).getTime() < Date.now() &&
                  t.status !== "done";
                const deps = (t.dependsOnIds ?? [])
                  .map((id) => titleById[id])
                  .filter(Boolean);
                return (
                  <li
                    key={t.id}
                    className="flex items-stretch border-b last:border-b-0 hover:bg-slate-50"
                  >
                    <button
                      type="button"
                      onClick={() => onOpen(t.id)}
                      className="shrink-0 truncate px-3 py-2 text-left text-sm text-slate-800"
                      style={{ width: LABEL_W }}
                      title={t.title}
                    >
                      {deps.length > 0 && (
                        <span
                          className="mr-1 text-slate-400"
                          title={`Depends on: ${deps.join(", ")}`}
                        >
                          ⛓
                        </span>
                      )}
                      {t.title}
                    </button>
                    <div className="relative flex-1 py-2">
                      {todayLeft >= 0 && todayLeft <= 100 && (
                        <div
                          className="absolute inset-y-0 border-l border-dashed border-red-200"
                          style={{ left: `${todayLeft}%` }}
                        />
                      )}
                      <button
                        type="button"
                        onClick={() => onOpen(t.id)}
                        className="absolute top-1/2 -translate-y-1/2 h-4 rounded-full text-[10px] text-white overflow-hidden whitespace-nowrap"
                        style={{
                          left: `${left}%`,
                          width: `${width}%`,
                          minWidth: 8,
                          background: statusColor(t.status),
                          outline: overdue
                            ? "2px solid var(--c-red)"
                            : undefined,
                          opacity: t.status === "done" ? 0.55 : 1,
                        }}
                        title={`${t.title} — ${
                          t.dueDate
                            ? "due " + format(new Date(t.dueDate), "MMM d")
                            : "no due date"
                        }`}
                      />
                    </div>
                  </li>
                );
              })}
            </ul>
          </div>
        </section>
      ))}
    </div>
  );
}
