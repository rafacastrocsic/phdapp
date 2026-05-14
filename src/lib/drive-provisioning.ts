import { prisma } from "./prisma";
import { driveForUser } from "./google";

interface ProvisionResult {
  ok: boolean;
  driveFolderId?: string;
  shared: number;
  failed: { email: string; error: string }[];
  warning?: string;
}

const FOLDER_MIME = "application/vnd.google-apps.folder";

async function getShareTargetEmails(
  studentId: string,
  ownerUserId: string,
): Promise<string[]> {
  const student = await prisma.student.findUnique({
    where: { id: studentId },
    select: {
      email: true,
      supervisor: { select: { email: true } },
      coSupervisors: {
        include: { user: { select: { email: true } } },
      },
    },
  });
  if (!student) return [];
  const emails = new Set<string>();
  if (student.email) emails.add(student.email.toLowerCase());
  if (student.supervisor?.email) emails.add(student.supervisor.email.toLowerCase());
  for (const cs of student.coSupervisors) {
    if (cs.user?.email) emails.add(cs.user.email.toLowerCase());
  }
  const owner = await prisma.user.findUnique({
    where: { id: ownerUserId },
    select: { email: true },
  });
  if (owner?.email) emails.delete(owner.email.toLowerCase());
  return Array.from(emails);
}

/**
 * Create a new Drive folder in the student's own Google account, named after
 * them, and grant writer access to every team member. Saves the folder id on
 * the Student record. Idempotent — returns a warning if a folder is already
 * linked.
 */
export async function createSharedDriveFolderForStudent(
  studentId: string,
  ownerUserId: string,
): Promise<ProvisionResult> {
  const drive = await driveForUser(ownerUserId);
  if (!drive)
    return { ok: false, shared: 0, failed: [], warning: "Google account not linked" };

  const student = await prisma.student.findUnique({
    where: { id: studentId },
    select: { id: true, fullName: true, alias: true, driveFolderId: true },
  });
  if (!student) return { ok: false, shared: 0, failed: [], warning: "Student not found" };
  if (student.driveFolderId) {
    return {
      ok: true,
      driveFolderId: student.driveFolderId,
      shared: 0,
      failed: [],
      warning: "A Drive folder is already linked. Use Sync sharing to refresh permissions instead.",
    };
  }

  const created = await drive.files.create({
    requestBody: {
      name: `${student.alias?.trim() || student.fullName} · PhD shared folder`,
      mimeType: FOLDER_MIME,
    },
    fields: "id",
  });
  const driveFolderId = created.data.id;
  if (!driveFolderId)
    return { ok: false, shared: 0, failed: [], warning: "Drive did not return a folder id" };

  await prisma.student.update({ where: { id: studentId }, data: { driveFolderId } });

  const result = await syncDriveFolderAcl(studentId, ownerUserId);
  return { ...result, driveFolderId };
}

/**
 * Refresh the permissions on the student's existing shared Drive folder so
 * that every team member has writer access. Adds missing entries; never
 * removes anyone.
 */
export async function syncDriveFolderAcl(
  studentId: string,
  ownerUserId: string,
): Promise<ProvisionResult> {
  const drive = await driveForUser(ownerUserId);
  if (!drive)
    return { ok: false, shared: 0, failed: [], warning: "Google account not linked" };

  const student = await prisma.student.findUnique({
    where: { id: studentId },
    select: { driveFolderId: true },
  });
  if (!student?.driveFolderId)
    return { ok: false, shared: 0, failed: [], warning: "Student has no linked Drive folder yet" };

  const targets = await getShareTargetEmails(studentId, ownerUserId);
  if (targets.length === 0) return { ok: true, shared: 0, failed: [] };

  let shared = 0;
  const failed: { email: string; error: string }[] = [];
  for (const email of targets) {
    try {
      await drive.permissions.create({
        fileId: student.driveFolderId,
        sendNotificationEmail: false,
        requestBody: {
          role: "writer",
          type: "user",
          emailAddress: email,
        },
      });
      shared++;
    } catch (err) {
      const e = err as { message?: string; code?: number };
      // Drive API doesn't return 409 on duplicates — it just adds another permission.
      // But sometimes it errors on invalid emails or other issues; surface those.
      if (e.code === 409) {
        shared++;
        continue;
      }
      failed.push({ email, error: e.message ?? "unknown" });
    }
  }

  return { ok: failed.length === 0, shared, failed };
}
