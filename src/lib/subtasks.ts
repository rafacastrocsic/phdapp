export interface Subtask {
  id: string;
  text: string;
  done: boolean;
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
      );
  } catch {
    return [];
  }
}
