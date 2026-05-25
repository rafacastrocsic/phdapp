import { prisma } from "./prisma";
import { calendarForUser } from "./google";

interface ProvisionResult {
  ok: boolean;
  calendarId?: string;
  shared: number;
  // Of those ACL targets, how many were PhDapp users whose own
  // Google token we could use to also auto-add the calendar to
  // their `Other calendars` list (so it appears in their Google
  // Calendar UI without them needing to click an email link).
  autoAdded: number;
  failed: { email: string; error: string }[];
  warning?: string;
}

/**
 * Build the list of emails that should have writer access to a student's
 * supervision calendar: the student themselves (if they have a User row with
 * an email) plus all co-supervisors. The owner (the user creating it) is
 * implicitly the calendar owner and doesn't need an ACL entry.
 *
 * Returns both the email (for ACL grants) and — when the share target is a
 * PhDapp user — their user id, so we can use their own Google client to
 * auto-add the calendar to their `calendarList`. ACL alone makes the
 * calendar reachable but doesn't add it to anyone's Google Calendar UI;
 * users would have to click the share email's "Add this calendar" link.
 * Auto-adding via the user's own token bypasses that step.
 */
interface ShareTarget {
  email: string;
  userId: string | null;
}
async function getShareTargets(
  studentId: string,
  ownerUserId: string,
): Promise<ShareTarget[]> {
  const student = await prisma.student.findUnique({
    where: { id: studentId },
    select: {
      email: true,
      userId: true,
      supervisorId: true,
      supervisor: { select: { id: true, email: true } },
      coSupervisors: {
        include: { user: { select: { id: true, email: true } } },
      },
    },
  });
  if (!student) return [];
  const byEmail = new Map<string, ShareTarget>();
  // Student themselves — may have a User row (student.userId) or be
  // a "shell" student with only an email on the Student row.
  if (student.email) {
    byEmail.set(student.email.toLowerCase(), {
      email: student.email.toLowerCase(),
      userId: student.userId ?? null,
    });
  }
  // Primary supervisor
  if (student.supervisor?.email) {
    byEmail.set(student.supervisor.email.toLowerCase(), {
      email: student.supervisor.email.toLowerCase(),
      userId: student.supervisor.id,
    });
  }
  // Additional supervisors / external advisors / committee members
  for (const cs of student.coSupervisors) {
    if (cs.user?.email) {
      byEmail.set(cs.user.email.toLowerCase(), {
        email: cs.user.email.toLowerCase(),
        userId: cs.user.id,
      });
    }
  }
  // Drop the calendar owner — they implicitly already see it.
  const owner = await prisma.user.findUnique({
    where: { id: ownerUserId },
    select: { email: true },
  });
  if (owner?.email) byEmail.delete(owner.email.toLowerCase());
  return Array.from(byEmail.values());
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
    return { ok: false, shared: 0, autoAdded: 0, failed: [], warning: "Google account not linked" };

  const student = await prisma.student.findUnique({
    where: { id: studentId },
    select: { id: true, fullName: true, alias: true, calendarId: true },
  });
  if (!student) return { ok: false, shared: 0, autoAdded: 0, failed: [], warning: "Student not found" };
  if (student.calendarId) {
    return {
      ok: true,
      calendarId: student.calendarId,
      shared: 0,
      autoAdded: 0,
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
    return { ok: false, shared: 0, autoAdded: 0, failed: [], warning: "Google did not return a calendar id" };

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
  if (!cal) return { ok: false, shared: 0, autoAdded: 0, failed: [], warning: "Google account not linked" };

  const student = await prisma.student.findUnique({
    where: { id: studentId },
    select: { calendarId: true },
  });
  if (!student?.calendarId)
    return { ok: false, shared: 0, autoAdded: 0, failed: [], warning: "Student has no linked calendar yet" };

  const targets = await getShareTargets(studentId, ownerUserId);
  if (targets.length === 0) return { ok: true, shared: 0, autoAdded: 0, failed: [] };

  let shared = 0;
  let autoAdded = 0;
  const failed: { email: string; error: string }[] = [];
  for (const t of targets) {
    // 1) Grant ACL access via the calendar owner's client.
    let aclOk = true;
    try {
      await cal.acl.insert({
        calendarId: student.calendarId,
        // sendNotifications:true so Google emails the share-target
        // with an "Add this calendar" link as a safety net for
        // non-PhDapp users (or any case where the auto-add below
        // fails). For PhDapp users we ALSO auto-add via their own
        // token below — Google's de-dup means the email/auto-add
        // combination is fine.
        sendNotifications: true,
        requestBody: {
          role: "writer",
          scope: { type: "user", value: t.email },
        },
      });
      shared++;
    } catch (err) {
      const e = err as { message?: string; code?: number };
      // 409 = already shared at that level. Treat as success.
      const msg = (e.message ?? "").toLowerCase();
      if (e.code === 409 || msg.includes("already") || msg.includes("duplicate")) {
        shared++;
      } else {
        aclOk = false;
        failed.push({ email: t.email, error: e.message ?? "unknown" });
      }
    }

    // 2) If the target is a PhDapp user (we have their userId AND
    //    they have a Google account linked), use THEIR token to add
    //    the calendar to their own calendarList. This is what makes
    //    the calendar appear in their Google Calendar UI without
    //    them having to click the email invite.
    if (aclOk && t.userId) {
      try {
        const theirCal = await calendarForUser(t.userId);
        if (theirCal) {
          await theirCal.calendarList.insert({
            requestBody: { id: student.calendarId },
          });
          autoAdded++;
        }
      } catch (err) {
        const e = err as { message?: string; code?: number };
        // 409 = already in their calendarList. Count as success.
        const msg = (e.message ?? "").toLowerCase();
        if (
          e.code === 409 ||
          e.code === 400 || // "Already exists" sometimes surfaces as 400
          msg.includes("already") ||
          msg.includes("duplicate")
        ) {
          autoAdded++;
        } else {
          // Don't fail the whole sync if a single auto-add fails —
          // the ACL share + email invite still works as fallback.
          console.warn(
            `calendarList.insert failed for ${t.email}: ${e.message ?? "unknown"}`,
          );
        }
      }
    }
  }

  return { ok: failed.length === 0, shared, autoAdded, failed };
}
