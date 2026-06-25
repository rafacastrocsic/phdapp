import { prisma } from "@/lib/prisma";
import { driveForUser } from "@/lib/google";

const KEY = "teamDriveFolderUrl";
const RE = /\/folders\/([a-zA-Z0-9_-]+)/;

/**
 * Resolve the admin-configured team Drive folder to a `{ id, url }` pair
 * (or null if no setting / unparseable). The Setting stores a URL; we
 * extract the folder id so it can be used as a picker root.
 */
export async function getTeamDriveFolder(): Promise<{
  id: string;
  url: string;
} | null> {
  const row = await prisma.setting.findUnique({ where: { key: KEY } });
  const url = row?.value?.trim();
  if (!url) return null;
  const m = url.match(RE);
  if (!m) return null;
  return { id: m[1], url };
}

export interface TeamDriveSyncResult {
  ok: boolean;
  shared: number;
  failed: { email: string; error: string }[];
  warning?: string;
}

/** Classify a Google error so the UI can give a tailored fix. */
function classify(msg: string): "invalid_grant" | "forbidden" | "other" {
  const m = msg.toLowerCase();
  if (
    m.includes("invalid_grant") ||
    m.includes("token has been expired") ||
    m.includes("revoked")
  )
    return "invalid_grant";
  if (m.includes("forbidden") || m.includes("403") || m.includes("insufficient"))
    return "forbidden";
  return "other";
}

/**
 * Grant writer access to the admin-configured team Drive folder for
 * the whole senior team (every User with role admin or supervisor),
 * so the Files-module "Team Drive" entry actually lists contents for
 * them (Drive denies accounts the folder isn't shared with).
 *
 * The folder lives in *someone's* Google account and we don't track
 * which — so we try a chain of plausible owners' tokens (the acting
 * user first, then every other admin/supervisor) until one can
 * actually write permissions on it. Adds missing entries; never
 * removes anyone. Idempotent (Google de-dups / 409 → counted as
 * already-shared).
 */
export async function syncTeamDriveAcl(
  actingUserId: string,
): Promise<TeamDriveSyncResult> {
  const folder = await getTeamDriveFolder();
  if (!folder)
    return {
      ok: false,
      shared: 0,
      failed: [],
      warning: "No team Drive folder is set. Add its URL first.",
    };

  // Recipients: every admin/supervisor with an email. (Co-supervisors
  // and team advisors carry a global "supervisor" role, so they're
  // included; students never are.)
  const recipients = await prisma.user.findMany({
    where: { role: { in: ["admin", "supervisor"] }, email: { not: "" } },
    select: { id: true, email: true },
  });
  const targetEmails = Array.from(
    new Set(
      recipients
        .map((u) => u.email?.trim().toLowerCase())
        .filter((e): e is string => !!e),
    ),
  );
  if (targetEmails.length === 0)
    return { ok: true, shared: 0, failed: [] };

  // Candidate "owner" tokens to try, in order: acting user first,
  // then the other admins/supervisors.
  const candidateIds = Array.from(
    new Set([actingUserId, ...recipients.map((u) => u.id)]),
  );

  const perTargetErrors: { email: string; error: string }[] = [];
  for (const candidateId of candidateIds) {
    const drive = await driveForUser(candidateId);
    if (!drive) continue;

    // Probe: try to share with the first target. If this account
    // can't manage the folder (403/404), move to the next candidate.
    let usable = false;
    let shared = 0;
    const failed: { email: string; error: string }[] = [];
    for (const email of targetEmails) {
      try {
        await drive.permissions.create({
          fileId: folder.id,
          sendNotificationEmail: false,
          requestBody: { role: "writer", type: "user", emailAddress: email },
        });
        usable = true;
        shared++;
      } catch (err) {
        const e = err as { message?: string; code?: number };
        const msg = e.message ?? "unknown";
        if (e.code === 409 || msg.toLowerCase().includes("already")) {
          // Already shared at this level — this account CAN see the
          // folder, so it's a usable owner; count as success.
          usable = true;
          shared++;
          continue;
        }
        const kind = classify(msg);
        // A folder-level access/not-found error means THIS account
        // can't manage the folder — abandon it and try the next
        // candidate (don't record per-target noise).
        if (
          !usable &&
          (kind === "forbidden" ||
            e.code === 404 ||
            msg.toLowerCase().includes("not found"))
        ) {
          failed.length = 0;
          break;
        }
        failed.push({ email, error: msg });
      }
    }

    if (usable) {
      return { ok: failed.length === 0, shared, failed };
    }
    // Remember the candidate's classification for the final message.
    perTargetErrors.push({
      email: candidateId,
      error: "could not manage folder",
    });
  }

  // No candidate could write to the folder.
  return {
    ok: false,
    shared: 0,
    failed: perTargetErrors,
    warning:
      "None of the team's Google accounts could share this folder — " +
      "PhDapp can only add people if the signed-in account owns it or has " +
      "“Make changes and share” rights. Either sign in as the folder's " +
      "owner and click Sync sharing again, or share it manually from " +
      "drive.google.com. (If accounts show as expired, those users should " +
      "sign out of PhDapp and back in to refresh their Google token.)",
  };
}
