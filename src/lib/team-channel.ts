import { prisma } from "./prisma";
import { displayName } from "./utils";

/**
 * Ensure a student has a general **team** chat channel — visible to the
 * whole supervision team (primary supervisor + co-supervisors, excluding
 * read-only team advisors) and the student. Idempotent: if the student
 * already has any channel tied to their id, it does nothing (so it's safe
 * to backfill existing students).
 *
 * Returns the channel id (existing or newly created), or null on failure.
 */
export async function ensureTeamChannel(
  studentId: string,
): Promise<string | null> {
  try {
    const existing = await prisma.channel.findFirst({
      where: { studentId },
      select: { id: true },
      orderBy: { createdAt: "asc" },
    });
    if (existing) return existing.id;

    const student = await prisma.student.findUnique({
      where: { id: studentId },
      select: {
        id: true,
        fullName: true,
        alias: true,
        color: true,
        userId: true,
        supervisorId: true,
        coSupervisors: {
          where: { role: { not: "team_advisor" } },
          select: { userId: true },
        },
      },
    });
    if (!student) return null;

    const memberIds = Array.from(
      new Set(
        [
          student.supervisorId,
          student.userId,
          ...student.coSupervisors.map((c) => c.userId),
        ].filter((x): x is string => !!x),
      ),
    );

    const channel = await prisma.channel.create({
      data: {
        name: `Team · ${displayName(student)}`,
        kind: "student",
        color: student.color,
        studentId: student.id,
        members: { create: memberIds.map((userId) => ({ userId })) },
      },
      select: { id: true },
    });
    return channel.id;
  } catch (err) {
    console.error("ensureTeamChannel failed", err);
    return null;
  }
}
