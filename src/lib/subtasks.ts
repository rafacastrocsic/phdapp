export interface Subtask {
  id: string;
  text: string;
  done: boolean;
  /** Optional deadline, an ISO date string "YYYY-MM-DD". */
  due?: string | null;
}

export function parseSubtasks(raw: string | null | undefined): Subtask[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter(
        (s): s is Subtask =>
          s &&
          typeof s.id === "string" &&
          typeof s.text === "string" &&
          typeof s.done === "boolean",
      )
      .map((s) => ({
        id: s.id,
        text: s.text,
        done: s.done,
        due:
          typeof (s as { due?: unknown }).due === "string" &&
          (s as { due: string }).due
            ? (s as { due: string }).due.slice(0, 10)
            : null,
      }));
  } catch {
    return [];
  }
}

/** Normalize a date-ish value to a "YYYY-MM-DD" day key (UTC), or null. */
function dayKey(v: string | Date | null | undefined): string | null {
  if (!v) return null;
  const d = typeof v === "string" ? new Date(v) : v;
  if (Number.isNaN(d.getTime())) return null;
  return d.toISOString().slice(0, 10);
}

/**
 * A subtask deadline may never fall AFTER the parent task's deadline.
 * Returns a human error message for the first offending subtask, or null if
 * everything is fine. If the task has no deadline, subtasks are unconstrained.
 */
export function subtaskDueViolation(
  subtasks: Subtask[],
  taskDue: string | Date | null | undefined,
): string | null {
  const taskKey = dayKey(taskDue ?? null);
  if (!taskKey) return null;
  for (const s of subtasks) {
    const k = dayKey(s.due ?? null);
    if (k && k > taskKey) {
      return `Subtask “${s.text || "untitled"}” is due ${k}, after the task's deadline (${taskKey}). A subtask can't be due after its task.`;
    }
  }
  return null;
}
