import { auth } from "@/auth";
import { prisma } from "./prisma";

export type Role = "admin" | "supervisor" | "student";

export function isAdmin(role: string | undefined | null): boolean {
  return role === "admin";
}

/**
 * Team Advisor is a PER-STUDENT relationship (a `CoSupervisor.role` value,
 * like external_advisor / committee), NOT a global User.role — so one person
 * can be a supervisor of student A and a team advisor of student B. A team
 * advisor sees their advised student fully (incl. supervisor-private notes &
 * wellbeing) but can never write — their only action is posting to the
 * Advisor-suggestions thread. No student can be a team advisor.
 */
export async function isTeamAdvisorAnywhere(userId: string): Promise<boolean> {
  const link = await prisma.coSupervisor.findFirst({
    where: { userId, role: "team_advisor" },
    select: { id: true },
  });
  return !!link;
}

export async function requireSession() {
  const session = await auth();
  if (!session?.user) throw new Error("UNAUTHENTICATED");
  return session;
}

/**
 * Default visibility filter for students.
 *
 * Anyone sees every student they are linked to in any way:
 *  - the supervisor (`supervisorId`)
 *  - any co-supervisor (`coSupervisors`)
 *  - the student themselves (matched via `userId`)
 *
 * So a supervisor who is ALSO co-supervising someone else's student sees both
 * groups in their portfolio. (Admins still get a global view via
 * `studentVisibilityWhereAllForAdmin`.)
 */
export function studentVisibilityWhere(userId: string, _role: Role) {
  return {
    OR: [
      { supervisorId: userId },
      // includes team_advisor links → a team advisor sees the students they
      // advise (read-only; write is blocked separately).
      { coSupervisors: { some: { userId } } },
      { userId },
    ],
  };
}

/**
 * Visibility filter that gives the admin a global view (used on /log and
 * other supervisor-management pages where admin should oversee everything).
 */
export function studentVisibilityWhereAllForAdmin(userId: string, role: Role) {
  if (role === "admin") return {};
  return studentVisibilityWhere(userId, role);
}

/** Throws if the user can't see this student. */
export async function assertCanSeeStudent(studentId: string) {
  const session = await requireSession();
  const student = await prisma.student.findFirst({
    where: {
      id: studentId,
      ...studentVisibilityWhere(session.user.id, session.user.role),
    },
    select: { id: true },
  });
  if (!student) throw new Error("FORBIDDEN");
  return session;
}

/**
 * Compute the viewer's effective access level on a specific student.
 *
 * `supervisor` covers anyone supervising this student — primary or additional
 * (the legacy CoSupervisor join table is kept under the hood, but the concept
 * "co-supervisor" no longer exists in the UI).
 */
export async function accessForStudent(studentId: string, userId: string, role: Role) {
  // Admin has supervisor-level access on every student.
  if (role === "admin") return "supervisor" as const;
  const sup = await prisma.student.findFirst({
    where: {
      id: studentId,
      OR: [
        { supervisorId: userId },
        // team_advisor links are READ-ONLY — they must NOT grant write access,
        // so exclude them here (external_advisor / committee still do, which
        // is the pre-existing behaviour).
        { coSupervisors: { some: { userId, role: { not: "team_advisor" } } } },
      ],
    },
    select: { id: true },
  });
  if (sup) return "supervisor" as const;
  // is the student themselves?
  const me = await prisma.student.findFirst({
    where: { id: studentId, userId },
    select: { id: true },
  });
  if (me) return "self" as const;
  return null;
}

export type StudentAccess = "supervisor" | "self" | null;

/** True if the viewer can create/update/delete tickets and events for this student. */
export function canWriteForStudent(a: StudentAccess) {
  return a === "supervisor" || a === "self";
}

/** True if the viewer can edit the student's profile. */
export function canEditStudentProfile(a: StudentAccess) {
  return a === "supervisor" || a === "self";
}

/** True if the viewer can manage the supervision team (add/remove other supervisors). */
export function canManageTeam(a: StudentAccess) {
  return a === "supervisor";
}

/** True if the viewer can delete the entire student record. */
export function canDeleteStudent(a: StudentAccess) {
  return a === "supervisor";
}

export type TeamLevel =
  | "supervisor"
  | "advisor"
  | "committee"
  | "self"
  | "observer" // Team Advisor: full read incl. private, zero write
  | null;

/**
 * Finer-grained than `accessForStudent`: distinguishes the viewer's actual
 * relationship to a student so features that must treat external advisors /
 * committee members differently from supervisors can do so.
 *
 *  admin / Student.supervisorId / CoSupervisor.role ∈ {supervisor, co_supervisor} → "supervisor"
 *  CoSupervisor.role === "external_advisor" → "advisor"
 *  CoSupervisor.role === "committee"        → "committee"
 *  Student.userId === userId                → "self"
 *  otherwise                                → null
 *
 * A user has at most one CoSupervisor row per student (`@@unique`), and the
 * primary-supervisor check wins over it, so precedence is unambiguous.
 */
export async function teamLevelForStudent(
  studentId: string,
  userId: string,
  role: Role,
): Promise<TeamLevel> {
  if (role === "admin") return "supervisor";

  const student = await prisma.student.findFirst({
    where: { id: studentId },
    select: {
      supervisorId: true,
      userId: true,
      coSupervisors: {
        where: { userId },
        select: { role: true },
      },
    },
  });
  if (!student) return null;

  if (student.supervisorId === userId) return "supervisor";

  const coRoles = new Set(student.coSupervisors.map((c) => c.role));
  if (coRoles.has("supervisor") || coRoles.has("co_supervisor"))
    return "supervisor";
  // Team Advisor: "observer" — non-null so detail/review pages render and
  // private material is visible, but never "supervisor" so no write gate
  // (which all check for "supervisor"/"self") ever lets them through.
  if (coRoles.has("team_advisor")) return "observer";
  if (coRoles.has("external_advisor")) return "advisor";
  if (coRoles.has("committee")) return "committee";

  if (student.userId === userId) return "self";
  return null;
}

/**
 * True if the viewer may see supervisor-private material for this student
 * (private supervisor notes, wellbeing scores). Excludes external advisors,
 * committee members, the student themselves, and unrelated users.
 */
export function canSeeSupervisorPrivate(t: TeamLevel): boolean {
  return t === "supervisor" || t === "observer";
}

/**
 * True if the viewer may CREATE/EDIT supervisor-private material (e.g. write
 * a private supervisor note). Stricter than `canSeeSupervisorPrivate`: a Team
 * Advisor ("observer") can read private material but must never write it.
 */
export function canWriteSupervisorPrivate(t: TeamLevel): boolean {
  return t === "supervisor";
}

/**
 * True if the user is a "real" supervisor — admin, or a supervisor who has at
 * least one supervised student (as primary or with CoSupervisor.role=supervisor).
 * Users whose only ties to students are external_advisor or committee don't
 * count, and don't get a Log Book.
 */
export async function isSupervisingUser(userId: string, role: Role): Promise<boolean> {
  if (role === "admin") return true;
  if (role !== "supervisor") return false;
  const primary = await prisma.student.findFirst({
    where: { supervisorId: userId },
    select: { id: true },
  });
  if (primary) return true;
  const supLink = await prisma.coSupervisor.findFirst({
    where: { userId, role: "supervisor" },
    select: { id: true },
  });
  return !!supLink;
}
