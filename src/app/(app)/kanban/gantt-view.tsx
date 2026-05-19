"use client";
import { Fragment, useMemo, useState } from "react";
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
 * Order a student's tasks so parents come first and each dependent task
 * is listed (indented) under the parent it depends on — a depth-first
 * walk of the dependency DAG. Multi-parent tasks appear once, under the
 * first parent that reaches them. Cycles / orphan deps fall back to the
 * end as un-indented rows. Siblings are ordered by start date.
 */
function orderByDependency(
  list: Ticket[],
): { ticket: Ticket; depth: number }[] {
  const ids = new Set(list.map((t) => t.id));
  const byId = new Map(list.map((t) => [t.id, t]));
  const parentsOf = new Map<string, string[]>();
  const childrenOf = new Map<string, string[]>();
  for (const t of list) {
    const ps = (t.dependsOnIds ?? []).filter(
      (p) => p !== t.id && ids.has(p),
    );
    parentsOf.set(t.id, ps);
    for (const p of ps) {
      const arr = childrenOf.get(p) ?? [];
      arr.push(t.id);
      childrenOf.set(p, arr);
    }
  }
  const byStart = (a: string, b: string) => {
    const ta = byId.get(a)!;
    const tb = byId.get(b)!;
    return startOf(ta) - startOf(tb) || ta.title.localeCompare(tb.title);
  };
  const out: { ticket: Ticket; depth: number }[] = [];
  const seen = new Set<string>();
  const visit = (id: string, depth: number) => {
    if (seen.has(id)) return;
    seen.add(id);
    out.push({ ticket: byId.get(id)!, depth });
    for (const k of (childrenOf.get(id) ?? []).slice().sort(byStart))
      visit(k, depth + 1);
  };
  const roots = list
    .filter((t) => (parentsOf.get(t.id) ?? []).length === 0)
    .map((t) => t.id)
    .sort(byStart);
  for (const r of roots) visit(r, 0);
  // Anything left (dependency cycle, or deps only on filtered-out tasks).
  for (const t of [...list].map((x) => x.id).sort(byStart))
    if (!seen.has(t)) visit(t, 0);
  return out;
}

/**
 * Lightweight dependency-aware Gantt: one row per task (start = created,
 * end = due date), grouped by student, with a "today" line. Tasks are
 * ordered so dependents sit indented under their parent. No external
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
        rows: orderByDependency(m[s.id] ?? []),
      }))
      .filter((g) => g.rows.length > 0);
  }, [tickets, students]);

  const titleById = useMemo(() => {
    const m: Record<string, string> = {};
    for (const t of tickets) m[t.id] = t.title;
    return m;
  }, [tickets]);

  // Task ids whose subtasks are hidden. Default = expanded (shown).
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const toggle = (id: string) =>
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

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
        dashed line is today; ⛓ marks tasks with dependencies. Click a task
        with sub-tasks (▾) to show/hide them; a ◆ marks each sub-task&apos;s
        deadline.
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
              {g.rows.map(({ ticket: t, depth }) => {
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
                const subs = t.subtasks ?? [];
                const hasSubs = subs.length > 0;
                const expanded = hasSubs && !collapsed.has(t.id);
                return (
                  <Fragment key={t.id}>
                  <li className="flex items-stretch border-b last:border-b-0 hover:bg-slate-50">
                    <button
                      type="button"
                      onClick={() =>
                        hasSubs ? toggle(t.id) : onOpen(t.id)
                      }
                      className="shrink-0 truncate py-2 pr-3 text-left text-sm text-slate-800"
                      style={{
                        width: LABEL_W,
                        paddingLeft: `${0.75 + depth * 1.1}rem`,
                      }}
                      title={
                        hasSubs
                          ? `${t.title} — ${expanded ? "hide" : "show"} ${subs.length} sub-task${subs.length === 1 ? "" : "s"} (click the bar to open the task)`
                          : depth > 0 && deps.length > 0
                            ? `${t.title} — depends on: ${deps.join(", ")}`
                            : t.title
                      }
                    >
                      {depth > 0 && (
                        <span className="mr-1 text-slate-300">↳</span>
                      )}
                      {hasSubs && (
                        <span className="mr-1 inline-block w-3 text-slate-400">
                          {expanded ? "▾" : "▸"}
                        </span>
                      )}
                      {deps.length > 0 && (
                        <span
                          className="mr-1 text-slate-400"
                          title={`Depends on: ${deps.join(", ")}`}
                        >
                          ⛓
                        </span>
                      )}
                      {t.title}
                      {hasSubs && (
                        <span className="ml-1 text-[10px] text-slate-400">
                          ({subs.filter((x) => x.done).length}/{subs.length})
                        </span>
                      )}
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
                  {expanded &&
                    subs.map((st) => {
                      const dueT = st.due
                        ? new Date(st.due + "T00:00:00").getTime()
                        : null;
                      const inRange =
                        dueT != null &&
                        dueT >= range.min &&
                        dueT <= range.max;
                      const dl =
                        dueT != null
                          ? ((dueT - range.min) / range.span) * 100
                          : null;
                      return (
                        <li
                          key={`${t.id}:${st.id}`}
                          className="flex items-stretch border-b last:border-b-0 bg-slate-50/40 hover:bg-slate-100/60"
                        >
                          <button
                            type="button"
                            onClick={() => onOpen(t.id)}
                            className="shrink-0 truncate py-1.5 pr-3 text-left text-[12px] text-slate-500"
                            style={{
                              width: LABEL_W,
                              paddingLeft: `${0.75 + depth * 1.1 + 1.6}rem`,
                            }}
                            title={`${st.text}${st.due ? ` — due ${format(new Date(st.due + "T00:00:00"), "MMM d")}` : " — no deadline"}`}
                          >
                            <span className="mr-1 text-slate-300">└</span>
                            <span
                              className={
                                st.done
                                  ? "line-through text-slate-400"
                                  : undefined
                              }
                            >
                              {st.text}
                            </span>
                          </button>
                          <div className="relative flex-1 py-1.5">
                            {todayLeft >= 0 && todayLeft <= 100 && (
                              <div
                                className="absolute inset-y-0 border-l border-dashed border-red-200"
                                style={{ left: `${todayLeft}%` }}
                              />
                            )}
                            {dl != null && inRange ? (
                              <span
                                onClick={() => onOpen(t.id)}
                                className="absolute top-1/2 h-2.5 w-2.5 cursor-pointer"
                                style={{
                                  left: `${dl}%`,
                                  transform:
                                    "translate(-50%, -50%) rotate(45deg)",
                                  background: st.done
                                    ? "var(--c-green)"
                                    : statusColor(t.status),
                                  opacity: st.done ? 0.6 : 1,
                                  outline:
                                    !st.done &&
                                    dueT != null &&
                                    dueT < Date.now()
                                      ? "2px solid var(--c-red)"
                                      : undefined,
                                }}
                                title={`${st.text} — due ${st.due ? format(new Date(st.due + "T00:00:00"), "MMM d") : "?"}`}
                              />
                            ) : (
                              <span className="absolute top-1/2 -translate-y-1/2 left-1 text-[10px] italic text-slate-300">
                                no deadline
                              </span>
                            )}
                          </div>
                        </li>
                      );
                    })}
                  </Fragment>
                );
              })}
            </ul>
          </div>
        </section>
      ))}
    </div>
  );
}
