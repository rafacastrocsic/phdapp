import { z } from "zod";

export interface ChecklistItem {
  id: string;
  text: string;
  done: boolean;
}

export const ChecklistInput = z
  .array(
    z.object({
      id: z.string().optional(),
      text: z.string().max(500),
      done: z.boolean().optional(),
    }),
  )
  .max(50);
export type ChecklistInputT = z.infer<typeof ChecklistInput>;

function genId(): string {
  return typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : Math.random().toString(36).slice(2);
}

/** Trim text, drop blank rows, ensure stable ids, cap the length. */
export function sanitiseChecklist(list: ChecklistInputT): ChecklistItem[] {
  return list
    .map((c) => ({
      id: c.id || genId(),
      text: c.text.trim().slice(0, 500),
      done: !!c.done,
    }))
    .filter((c) => c.text.length > 0)
    .slice(0, 50);
}

export function parseChecklist(raw: string | null | undefined): ChecklistItem[] {
  if (!raw) return [];
  try {
    const j = JSON.parse(raw);
    if (!Array.isArray(j)) return [];
    return j
      .filter((c) => c && typeof c.text === "string")
      .map((c) => ({
        id: typeof c.id === "string" ? c.id : genId(),
        text: c.text as string,
        done: !!c.done,
      }));
  } catch {
    return [];
  }
}

/** Completion % from a checklist, or null when it's empty (use manual %). */
export function checklistProgress(list: ChecklistItem[]): number | null {
  if (list.length === 0) return null;
  const done = list.filter((c) => c.done).length;
  return Math.round((done / list.length) * 100);
}
