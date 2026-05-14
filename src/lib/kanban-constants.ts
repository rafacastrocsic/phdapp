export const STATUSES = [
  { id: "backlog", label: "Backlog", color: "#94a3b8" },
  { id: "todo", label: "To do", color: "#2196f3" },
  { id: "in_progress", label: "In progress", color: "#ff7a45" },
  { id: "review", label: "Review", color: "#a855f7" },
  { id: "blocked", label: "Blocked", color: "#e2445c" },
  { id: "done", label: "Done", color: "#00ca72" },
] as const;
export type StatusId = (typeof STATUSES)[number]["id"];

export const PRIORITIES = [
  { id: "low", label: "Low", color: "#94a3b8" },
  { id: "medium", label: "Medium", color: "#2196f3" },
  { id: "high", label: "High", color: "#ff7a45" },
  { id: "urgent", label: "Urgent", color: "#e2445c" },
] as const;
export type PriorityId = (typeof PRIORITIES)[number]["id"];

export const CATEGORIES = [
  { id: "research", label: "Research", color: "#6f4cff" },
  { id: "writing", label: "Writing", color: "#ec4899" },
  { id: "experiment", label: "Experiment", color: "#00d1c1" },
  { id: "reading", label: "Reading", color: "#2196f3" },
  { id: "publication", label: "Publication", color: "#a855f7" },
  { id: "conference", label: "Conference", color: "#ff7a45" },
  { id: "meeting", label: "Meeting", color: "#00ca72" },
  { id: "admin", label: "Admin", color: "#94a3b8" },
  { id: "other", label: "Other", color: "#64748b" },
] as const;
export type CategoryId = (typeof CATEGORIES)[number]["id"];

export function statusColor(id: string) {
  return STATUSES.find((s) => s.id === id)?.color ?? "#94a3b8";
}
export function priorityColor(id: string) {
  return PRIORITIES.find((p) => p.id === id)?.color ?? "#94a3b8";
}
export function categoryColor(id: string) {
  return (
    CATEGORIES.find((c) => c.id === id)?.color ??
    CATEGORIES.find((c) => c.id === "other")!.color
  );
}

const CANONICAL_NON_OTHER_CATEGORY_IDS = new Set<string>(
  CATEGORIES.filter((c) => c.id !== "other").map((c) => c.id),
);

/** True when the value falls under the "Other" bucket — either literal "other"
 * or a custom user-typed label that isn't one of the predefined categories. */
export function isOtherCategory(value: string): boolean {
  return !CANONICAL_NON_OTHER_CATEGORY_IDS.has(value);
}
