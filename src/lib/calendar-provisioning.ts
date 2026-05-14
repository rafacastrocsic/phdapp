import { prisma } from "./prisma";
import { calendarForUser } from "./google";

interface ProvisionResult {
  ok: boolean;
  calendarId?: string;
  shared: number;
  failed: { email: string; error: string }[];
  warning?: string;
}

/**
 * Build the list of emails that should have writer access to a student's
 * supervision calendar: the student themselves (if they have a User row with
 * an email) plus all co-supervisors. The owner (the user creating it) is
 * implicitly the calendar owner and doesn't need an ACL entry.
 */
async function getShareTargetEmails(studentId: string, ownerUserId: string): Promise<string[]> {
  const student = await prisma.student.findUnique({
    where: { id: studentId },
    select: {
      email: true,
      supervisorId: true,
      supervisor: { select: { email: true } },
      coSupervisors: {
        include: { user: { select: { email: true } } },
      },
    },
  });
  if (!student) return [];
  const emails = new Set<string>();
  // Student themselves
  if (student.email) emails.add(student.email.toLowerCase());
  // Primary supervisor
  if (student.supervisor?.email) emails.add(student.supervisor.email.toLowerCase());
  // Additional supervisors / external advisors / committee members
  for (const cs of student.coSupervisors) {
    if (cs.user?.email) emails.add(cs.user.email.toLowerCase());
  }
  // The owner of the calendar (whoever created it) is implicit, so drop them.
  const owner = await prisma.user.findUnique({
    where: { id: ownerUserId },
    select: { email: true },
  });
  if (owner?.email) emails.delete(owner.email.toLowerCase());
  return Array.from(emails);
}

/**
 * Create a fresh shared calendar in the supervisor's Google account and grant
 * writer access to the student + all co-supervisors. Saves the new calendar
 * id on the Student record. Idempotent: if Student.calendarId is already set,
 * returns ok with a `warning`.
 */
export async function createSharedCalendarForStudent(
  studentId: string,
  ownerUserId: string,
): Promise<ProvisionResult> {
  const cal = await calendarForUser(ownerUserId);
  if (!cal)
    return { ok: false, shared: 0, failed: [], warning: "Google account not linked" };

  const student = await prisma.student.findUnique({
    where: { id: studentId },
    select: { id: true, fullName: true, alias: true, calendarId: true },
  });
  if (!student) return { ok: false, shared: 0, failed: [], warning: "Student not found" };
  if (student.calendarId) {
    return {
      ok: true,
      calendarId: student.calendarId,
      shared: 0,
      failed: [],
      warning: "A calendar is already linked. Use the Sync button to refresh sharing instead.",
    };
  }

  const created = await cal.calendars.insert({
    requestBody: {
      summary: `${student.alias?.trim() || student.fullName} · PhD supervision`,
      description: `Shared supervision calendar for ${student.fullName}, managed by PhDapp.`,
    },
  });
  const calendarId = created.data.id;
  if (!calendarId)
    return { ok: false, shared: 0, failed: [], warning: "Google did not return a calendar id" };

  await prisma.student.update({ where: { id: studentId }, data: { calendarId } });

  const result = await syncCalendarAcl(studentId, ownerUserId);
  return { ...result, calendarId };
}

/**
 * Refresh the ACL on the student's existing shared calendar so the team has
 * writer access. Adds missing entries; does not remove unknown ones.
 * Returns counts of how many shares were applied vs failed.
 */
export async function syncCalendarAcl(
  studentId: string,
  ownerUserId: string,
): Promise<ProvisionResult> {
  const cal = await calendarForUser(ownerUserId);
  if (!cal) return { ok: false, shared: 0, failed: [], warning: "Google account not linked" };

  const student = await prisma.student.findUnique({
    where: { id: studentId },
    select: { calendarId: true },
  });
  if (!student?.calendarId)
    return { ok: false, shared: 0, failed: [], warning: "Student has no linked calendar yet" };

  const targets = await getShareTargetEmails(studentId, ownerUserId);
  if (targets.length === 0) return { ok: true, shared: 0, failed: [] };

  let shared = 0;
  const failed: { email: string; error: string }[] = [];
  for (const email of targets) {
    try {
      await cal.acl.insert({
        calendarId: student.calendarId,
        sendNotifications: false,
        requestBody: {
          role: "writer",
          scope: { type: "user", value: email },
        },
      });
      shared++;
    } catch (err) {
      const e = err as { message?: string; code?: number };
      // 409 = already shared at that level. Treat as success.
      const msg = (e.message ?? "").toLowerCase();
      if (e.code === 409 || msg.includes("already") || msg.includes("duplicate")) {
        shared++;
        continue;
      }
      failed.push({ email, error: e.message ?? "unknown" });
    }
  }

  return { ok: failed.length === 0, shared, failed };
}
