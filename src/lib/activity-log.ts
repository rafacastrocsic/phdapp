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
}

/**
 * Record an action in the activity log. Every role's actions are logged;
 * the /log page filters visibility by role when displaying.
 */
export async function logActivity(p: LogParams) {
  try {
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
