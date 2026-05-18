import { prisma } from "./prisma";

interface LogParams {
  actorId: string;
  actorRole: string;
  studentId: string | null;
  action: string;
  entityType?: string;
  entityId?: string;
  summary: string;
  details?: Record<string, unknown>;
  /**
   * Collapse rapid repeated entries: if the same actor logged the same
   * action on the same entity within `coalesceWindowMs` (default 5 min),
   * update that row in place instead of inserting a new one. Keeps the log
   * lean when a form auto-saves several times for one logical edit.
   */
  coalesce?: boolean;
  coalesceWindowMs?: number;
}

/**
 * Record an action in the activity log. Every role's actions are logged;
 * the /log page filters visibility by role when displaying. Callers should
 * only invoke this for *material* changes (no-ops shouldn't be logged).
 */
export async function logActivity(p: LogParams) {
  try {
    if (p.coalesce && p.entityId) {
      const windowMs = p.coalesceWindowMs ?? 5 * 60_000;
      const since = new Date(Date.now() - windowMs);
      const recent = await prisma.activityLog.findFirst({
        where: {
          actorId: p.actorId,
          action: p.action,
          entityId: p.entityId,
          createdAt: { gt: since },
        },
        orderBy: { createdAt: "desc" },
        select: { id: true },
      });
      if (recent) {
        await prisma.activityLog.update({
          where: { id: recent.id },
          data: {
            summary: p.summary,
            details: p.details ? JSON.stringify(p.details) : null,
            actorRoleAtTime: p.actorRole,
            studentId: p.studentId,
            // Bump so it reflects the latest edit time + sorts correctly.
            createdAt: new Date(),
            // A fresh edit is unread again for everyone.
            readBy: null,
          },
        });
        return;
      }
    }

    await prisma.activityLog.create({
      data: {
        actorId: p.actorId,
        actorRoleAtTime: p.actorRole,
        studentId: p.studentId,
        action: p.action,
        entityType: p.entityType ?? null,
        entityId: p.entityId ?? null,
        summary: p.summary,
        details: p.details ? JSON.stringify(p.details) : null,
      },
    });
  } catch (err) {
    // never let a logging failure break the user's action
    console.error("logActivity failed", err);
  }
}
