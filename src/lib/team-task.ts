/**
 * "Team only" placeholder student used as a stand-in on the UI side for
 * tasks (Ticket) that have NULL studentId. Lets every consumer of
 * `ticket.student.*` keep working unchanged; the real intent is carried
 * by a sibling `teamOnly: boolean` field on each ticket payload.
 *
 * The id "__team__" is sentinel — never a real Student.id (cuid format).
 */
export const TEAM_ONLY_STUDENT_ID = "__team__" as const;
export const TEAM_ONLY_STUDENT = {
  id: TEAM_ONLY_STUDENT_ID,
  fullName: "Team only",
  alias: null as string | null,
  color: "#94a3b8", // neutral slate
} as const;

type ServerStudent = {
  id: string;
  fullName: string;
  alias: string | null;
  color: string;
} | null;

/**
 * Map a Prisma-loaded `student` (which is now nullable on Ticket) to the
 * non-null UI shape: either the real student fields or the placeholder.
 */
export function asUiStudent(s: ServerStudent): {
  id: string;
  fullName: string;
  alias: string | null;
  color: string;
} {
  if (s) return s;
  return { ...TEAM_ONLY_STUDENT };
}

/** True when the task has no student (the row above is the placeholder). */
export function isTeamOnly(studentId: string | null | undefined): boolean {
  return !studentId;
}
