import { del } from "@vercel/blob";
import { prisma } from "./prisma";

const RETENTION_DAYS = 7;

interface AttachmentRecord {
  url?: string;
}

let lastRunAt = 0; // ms epoch

/**
 * Throttled wrapper — runs the cleanup at most once per hour. Safe to call
 * from request handlers without blocking; failures are logged but swallowed.
 */
export async function maybeCleanupChatAttachments() {
  const now = Date.now();
  if (now - lastRunAt < 60 * 60 * 1000) return; // < 1h since last run
  lastRunAt = now;
  try {
    await cleanupChatAttachments();
  } catch (err) {
    console.error("chat cleanup failed", err);
  }
}

/**
 * Delete attachment files older than RETENTION_DAYS, and clear the
 * `attachments` JSON on the corresponding messages. Messages themselves
 * (their text body) are kept.
 *
 * Returns counts of files deleted and messages cleared.
 */
export async function cleanupChatAttachments(): Promise<{
  deletedFiles: number;
  clearedMessages: number;
}> {
  const cutoff = new Date(Date.now() - RETENTION_DAYS * 24 * 60 * 60 * 1000);
  const old = await prisma.message.findMany({
    where: {
      createdAt: { lt: cutoff },
      attachments: { not: null },
    },
    select: { id: true, attachments: true },
  });

  let deletedFiles = 0;
  let clearedMessages = 0;

  for (const m of old) {
    let list: AttachmentRecord[] = [];
    try {
      const parsed = JSON.parse(m.attachments!);
      if (Array.isArray(parsed)) list = parsed as AttachmentRecord[];
    } catch {
      // ignore parse errors
    }

    for (const att of list) {
      if (!att?.url) continue;
      // Only touch our managed chat blobs (skip external links and legacy local paths).
      if (!/\/chat\//.test(att.url) || !/^https?:\/\//.test(att.url)) continue;
      try {
        await del(att.url);
        deletedFiles++;
      } catch {
        // blob may already be gone; ignore
      }
    }

    await prisma.message.update({
      where: { id: m.id },
      data: { attachments: null },
    });
    clearedMessages++;
  }

  return { deletedFiles, clearedMessages };
}
