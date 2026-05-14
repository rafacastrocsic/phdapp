import { auth } from "@/auth";
import { prisma } from "./prisma";

export type Role = "admin" | "supervisor" | "student";

export function isAdmin(role: string | undefined | null): boolean {
  return role === "admin";
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
        { coSupervisors: { some: { userId } } },
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
