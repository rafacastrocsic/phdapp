import { NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";

const Body = z.object({
  startsAt: z.string(),
  endsAt: z.string(),
  // Optional PUBLIC label. Empty → UI shows "Unavailable".
  reason: z.string().max(200).nullable().optional(),
  // Optional PRIVATE memo. Visible only to the author.
  label: z.string().max(200).nullable().optional(),
  // away   = not available at all (default)
  // remote = working but off-site (still reachable; renders green)
  // busy   = legacy alias of "away"; kept for old rows
  kind: z.enum(["away", "remote", "busy"]).optional(),
});

// The signed-in user's own availability entries.
export async function GET() {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "unauth" }, { status: 401 });
  const items = await prisma.availability.findMany({
    where: { userId: session.user.id },
    orderBy: { startsAt: "asc" },
  });
  return NextResponse.json({ items });
}

// Any authenticated user can post their own availability. Used by
// supervisors AND students (vacation / doctor's / remote / etc.).
// The author is the signed-in user — there's no "post on behalf of"
// path, so authorization is just "must be signed in".
export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "unauth" }, { status: 401 });

  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success)
    return NextResponse.json({ error: "bad input" }, { status: 400 });
  const d = parsed.data;
  const item = await prisma.availability.create({
    data: {
      userId: session.user.id,
      startsAt: new Date(d.startsAt),
      endsAt: new Date(d.endsAt),
      reason: d.reason?.trim() || null,
      label: d.label?.trim() || null,
      kind: d.kind ?? "away",
    },
  });

  // ── Activity-log fan-out ──
  // Drives Calendar's "unread" bubble + the 🔔 bell.
  //  - When the AUTHOR is a student → log on their own student row
  //    so their supervisors get the notification.
  //  - When the AUTHOR is a supervisor / admin → log on each of the
  //    students they supervise (so those students see it). Reason is
  //    intentionally kept out of the activity summary — the calendar
  //    chip carries it; the bell just signals "something changed".
  const targetStudentIds = await getNotificationTargets(session.user.id);
  if (targetStudentIds.length > 0) {
    const { logActivity } = await import("@/lib/activity-log");
    // Summary phrasing follows the kind so the 🔔 bell + Calendar
    // sidebar bubble read sensibly: "remote work" reads as the
    // person is still reachable; "unavailable" reads as away.
    const summary =
      item.kind === "remote"
        ? "marked a period of remote work"
        : "marked a period unavailable";
    await Promise.all(
      targetStudentIds.map((sid) =>
        logActivity({
          actorId: session.user.id,
          actorRole: session.user.role,
          studentId: sid,
          action: "availability.create",
          entityType: "availability",
          entityId: item.id,
          summary,
        }),
      ),
    ).catch((err) => console.error("availability log failed", err));
  }

  return NextResponse.json({ item });
}

/**
 * For activity-log fan-out, return the set of Student ids that
 * should "see" the change. Asymmetric on purpose:
 *  - If the author IS a student → just their own student row
 *    (supervisors learn about it).
 *  - Otherwise → the students they primary-supervise or co-supervise
 *    (the students learn about it).
 */
async function getNotificationTargets(userId: string): Promise<string[]> {
  const ownStudent = await prisma.student.findFirst({
    where: { userId },
    select: { id: true },
  });
  if (ownStudent) return [ownStudent.id];
  const supervised = await prisma.student.findMany({
    where: {
      OR: [
        { supervisorId: userId },
        {
          coSupervisors: {
            some: { userId, role: { in: ["supervisor", "co_supervisor"] } },
          },
        },
      ],
    },
    select: { id: true },
  });
  return supervised.map((s) => s.id);
}
