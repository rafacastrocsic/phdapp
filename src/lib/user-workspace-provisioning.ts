import { prisma } from "./prisma";
import { driveForUser, calendarForUser } from "./google";

/**
 * Provisioning for a Project Researcher's own Drive folder and calendar —
 * managed like a student's (created by an admin/supervisor in their own
 * Google account, then shared), NOT self-service.
 *
 * Share circle = for every student the researcher is a `project_researcher`
 * of: that student + the student's supervisors/co-supervisors + team advisors
 * (external advisors and committee members are excluded). Everyone in the
 * circle gets VIEW-ONLY (reader); the researcher edits their own. So the
 * student and researcher can see each other's folders/calendars but not edit
 * them, and the student's supervisors + team advisors can see them too.
 */

const FOLDER_MIME = "application/vnd.google-apps.folder";
type Level = "reader" | "writer";

interface ProvisionResult {
  ok: boolean;
  driveFolderId?: string;
  calendarId?: string;
  shared?: number;
  autoAdded?: number;
  failed?: { email: string; error: string }[];
  warning?: string;
}

interface ShareTarget {
  email: string;
  userId: string | null;
  level: Level;
}

/**
 * Build the share list for a researcher's own folder/calendar: the researcher
 * (writer, it's theirs) plus everyone in each assigned student's circle
 * (reader). `ownerEmail` (the admin/supervisor whose Google account holds the
 * resource) is dropped — they implicitly own it.
 */
async function getResearcherShareTargets(
  userId: string,
  ownerUserId: string,
): Promise<ShareTarget[]> {
  const me = await prisma.user.findUnique({
    where: { id: userId },
    select: { email: true },
  });

  const students = await prisma.student.findMany({
    where: { coSupervisors: { some: { userId, role: "project_researcher" } } },
    select: {
      email: true,
      userId: true,
      supervisor: { select: { id: true, email: true } },
      coSupervisors: {
        where: { role: { in: ["supervisor", "co_supervisor", "team_advisor"] } },
        select: { user: { select: { id: true, email: true } } },
      },
    },
  });

  const byEmail = new Map<string, ShareTarget>();
  const put = (
    email: string | null | undefined,
    uid: string | null,
    level: Level,
  ) => {
    if (!email) return;
    const e = email.toLowerCase();
    const existing = byEmail.get(e);
    if (existing?.level === "writer") return; // writer wins
    byEmail.set(e, { email: e, userId: uid, level });
  };

  // The researcher edits their own folder/calendar.
  put(me?.email, userId, "writer");

  for (const s of students) {
    put(s.email, s.userId ?? null, "reader");
    put(s.supervisor?.email, s.supervisor?.id ?? null, "reader");
    for (const cs of s.coSupervisors)
      put(cs.user?.email, cs.user?.id ?? null, "reader");
  }

  const owner = await prisma.user.findUnique({
    where: { id: ownerUserId },
    select: { email: true },
  });
  if (owner?.email) byEmail.delete(owner.email.toLowerCase());
  return Array.from(byEmail.values());
}

/** Create the researcher's Drive folder (in the owner's account) and share it. */
export async function createResearcherDriveFolder(
  userId: string,
  ownerUserId: string,
): Promise<ProvisionResult> {
  const drive = await driveForUser(ownerUserId);
  if (!drive) return { ok: false, warning: "Your Google account isn't linked" };

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { name: true, driveFolderId: true },
  });
  if (!user) return { ok: false, warning: "User not found" };
  if (user.driveFolderId)
    return {
      ok: true,
      driveFolderId: user.driveFolderId,
      warning: "A folder is already linked. Use Sync to refresh sharing.",
    };

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
  const r = await syncResearcherDriveAcl(userId, ownerUserId);
  return { ...r, driveFolderId };
}

/** Re-share the researcher's folder (view-only for the circle). Adds only. */
export async function syncResearcherDriveAcl(
  userId: string,
  ownerUserId: string,
): Promise<ProvisionResult> {
  const drive = await driveForUser(ownerUserId);
  if (!drive) return { ok: false, warning: "Your Google account isn't linked" };

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { driveFolderId: true },
  });
  if (!user?.driveFolderId)
    return { ok: false, warning: "No workspace folder yet" };

  const targets = await getResearcherShareTargets(userId, ownerUserId);
  let shared = 0;
  const failed: { email: string; error: string }[] = [];
  for (const t of targets) {
    try {
      await drive.permissions.create({
        fileId: user.driveFolderId,
        sendNotificationEmail: false,
        requestBody: { role: t.level, type: "user", emailAddress: t.email },
      });
      shared++;
    } catch (err) {
      const e = err as { message?: string; code?: number };
      if (e.code === 409) {
        shared++;
        continue;
      }
      failed.push({ email: t.email, error: e.message ?? "unknown" });
    }
  }
  return { ok: failed.length === 0, driveFolderId: user.driveFolderId, shared, failed };
}

/** Create the researcher's calendar (in the owner's account) and share it. */
export async function createResearcherCalendar(
  userId: string,
  ownerUserId: string,
): Promise<ProvisionResult> {
  const cal = await calendarForUser(ownerUserId);
  if (!cal) return { ok: false, warning: "Your Google account isn't linked" };

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { name: true, calendarId: true },
  });
  if (!user) return { ok: false, warning: "User not found" };
  if (user.calendarId)
    return {
      ok: true,
      calendarId: user.calendarId,
      warning: "A calendar is already linked. Use Sync to refresh sharing.",
    };

  const created = await cal.calendars.insert({
    requestBody: {
      summary: `${user.name?.trim() || "Researcher"} · PhDapp`,
      description: "Project researcher workspace calendar, managed by PhDapp.",
    },
  });
  const calendarId = created.data.id;
  if (!calendarId)
    return { ok: false, warning: "Google did not return a calendar id" };

  await prisma.user.update({ where: { id: userId }, data: { calendarId } });
  const r = await syncResearcherCalendarAcl(userId, ownerUserId);
  return { ...r, calendarId };
}

/** Re-share the researcher's calendar (view-only for the circle). Adds only. */
export async function syncResearcherCalendarAcl(
  userId: string,
  ownerUserId: string,
): Promise<ProvisionResult> {
  const cal = await calendarForUser(ownerUserId);
  if (!cal) return { ok: false, warning: "Your Google account isn't linked" };

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { calendarId: true },
  });
  if (!user?.calendarId) return { ok: false, warning: "No workspace calendar yet" };

  const targets = await getResearcherShareTargets(userId, ownerUserId);
  let shared = 0;
  let autoAdded = 0;
  const failed: { email: string; error: string }[] = [];
  for (const t of targets) {
    let aclOk = true;
    try {
      await cal.acl.insert({
        calendarId: user.calendarId,
        sendNotifications: true,
        requestBody: { role: t.level, scope: { type: "user", value: t.email } },
      });
      shared++;
    } catch (err) {
      const e = err as { message?: string; code?: number };
      const msg = (e.message ?? "").toLowerCase();
      if (e.code === 409 || msg.includes("already") || msg.includes("duplicate")) {
        shared++;
      } else {
        aclOk = false;
        failed.push({ email: t.email, error: e.message ?? "unknown" });
      }
    }
    // Add to the target's own Google calendar list if they're a PhDapp user.
    if (aclOk && t.userId) {
      try {
        const theirCal = await calendarForUser(t.userId);
        if (theirCal) {
          await theirCal.calendarList.insert({ requestBody: { id: user.calendarId } });
          autoAdded++;
        }
      } catch {
        // best-effort; the ACL share + email invite still work
      }
    }
  }
  return { ok: failed.length === 0, calendarId: user.calendarId, shared, autoAdded, failed };
}
