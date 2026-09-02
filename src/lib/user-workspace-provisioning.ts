import { prisma } from "./prisma";
import { driveForUser, calendarForUser } from "./google";

/**
 * Self-service "My workspace" provisioning for a Project Researcher: their
 * OWN Google Drive folder and calendar, created in their OWN Google account.
 *
 * The folder is shared VIEW-ONLY (reader) with the supervising team (admins +
 * real supervisors), and — when `workspaceShareStudents` is on — also with the
 * researcher's assigned students (the students they're `project_researcher`
 * for). The calendar is provisioned and surfaced as a link; it is not shared.
 */

const FOLDER_MIME = "application/vnd.google-apps.folder";

interface ProvisionResult {
  ok: boolean;
  driveFolderId?: string;
  calendarId?: string;
  shared?: number;
  failed?: { email: string; error: string }[];
  warning?: string;
}

/**
 * Emails the researcher's folder should be shared with (all as `reader`):
 * the supervising team (admins + anyone who primary-supervises or is a
 * supervisor/co-supervisor of a student), plus — when the researcher has
 * opted in — the students they are a project researcher for.
 */
async function getWorkspaceShareEmails(userId: string): Promise<string[]> {
  const me = await prisma.user.findUnique({
    where: { id: userId },
    select: { email: true, workspaceShareStudents: true },
  });
  if (!me) return [];

  const supervisors = await prisma.user.findMany({
    where: {
      OR: [
        { role: "admin" },
        { supervisedStudents: { some: {} } },
        {
          coSupervisedStudents: {
            some: { role: { in: ["supervisor", "co_supervisor"] } },
          },
        },
      ],
    },
    select: { email: true },
  });

  const emails = new Set<string>();
  for (const s of supervisors) if (s.email) emails.add(s.email.toLowerCase());

  if (me.workspaceShareStudents) {
    const students = await prisma.student.findMany({
      where: { coSupervisors: { some: { userId, role: "project_researcher" } } },
      select: { email: true },
    });
    for (const st of students) if (st.email) emails.add(st.email.toLowerCase());
  }

  // Never try to share the folder with its own owner.
  if (me.email) emails.delete(me.email.toLowerCase());
  return Array.from(emails);
}

/** Create the researcher's own Drive folder (idempotent) and share it. */
export async function createOwnDriveFolderForUser(
  userId: string,
): Promise<ProvisionResult> {
  const drive = await driveForUser(userId);
  if (!drive) return { ok: false, warning: "Google account not linked" };

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { name: true, driveFolderId: true },
  });
  if (!user) return { ok: false, warning: "User not found" };
  if (user.driveFolderId) {
    return {
      ok: true,
      driveFolderId: user.driveFolderId,
      warning: "A folder is already linked. Use Sync to refresh sharing.",
    };
  }

  const created = await drive.files.create({
    requestBody: {
      name: `${user.name?.trim() || "Researcher"} · PhDapp workspace`,
      mimeType: FOLDER_MIME,
    },
    fields: "id",
  });
  const driveFolderId = created.data.id;
  if (!driveFolderId)
    return { ok: false, warning: "Drive did not return a folder id" };

  await prisma.user.update({ where: { id: userId }, data: { driveFolderId } });
  const r = await syncOwnDriveFolderAcl(userId);
  return { ...r, driveFolderId };
}

/** Re-share the researcher's existing folder (view-only). Adds, never removes. */
export async function syncOwnDriveFolderAcl(
  userId: string,
): Promise<ProvisionResult> {
  const drive = await driveForUser(userId);
  if (!drive) return { ok: false, warning: "Google account not linked" };

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { driveFolderId: true },
  });
  if (!user?.driveFolderId)
    return { ok: false, warning: "No workspace folder yet" };

  const targets = await getWorkspaceShareEmails(userId);
  let shared = 0;
  const failed: { email: string; error: string }[] = [];
  for (const email of targets) {
    try {
      await drive.permissions.create({
        fileId: user.driveFolderId,
        sendNotificationEmail: false,
        requestBody: { role: "reader", type: "user", emailAddress: email },
      });
      shared++;
    } catch (err) {
      const e = err as { message?: string; code?: number };
      if (e.code === 409) {
        shared++;
        continue;
      }
      failed.push({ email, error: e.message ?? "unknown" });
    }
  }
  return { ok: failed.length === 0, driveFolderId: user.driveFolderId, shared, failed };
}

/** Create the researcher's own calendar (idempotent). Surfaced as a link. */
export async function createOwnCalendarForUser(
  userId: string,
): Promise<ProvisionResult> {
  const cal = await calendarForUser(userId);
  if (!cal) return { ok: false, warning: "Google account not linked" };

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { name: true, calendarId: true },
  });
  if (!user) return { ok: false, warning: "User not found" };
  if (user.calendarId)
    return {
      ok: true,
      calendarId: user.calendarId,
      warning: "A calendar is already linked.",
    };

  const created = await cal.calendars.insert({
    requestBody: {
      summary: `${user.name?.trim() || "Researcher"} · PhDapp`,
      description: "Personal PhDapp workspace calendar.",
    },
  });
  const calendarId = created.data.id;
  if (!calendarId)
    return { ok: false, warning: "Google did not return a calendar id" };

  await prisma.user.update({ where: { id: userId }, data: { calendarId } });
  return { ok: true, calendarId };
}
