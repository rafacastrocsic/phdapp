import { NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";

const Body = z.object({
  startsAt: z.string(),
  endsAt: z.string(),
  label: z.string().nullable().optional(),
  kind: z.enum(["away", "busy"]).optional(),
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

export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "unauth" }, { status: 401 });
  // Only supervisors/admins mark availability. Students don't, and Team
  // Advisors are read-only observers (no availability of their own to share).
  if (
    session.user.role === "student" ||
    session.user.role === "team_advisor"
  )
    return NextResponse.json({ error: "forbidden" }, { status: 403 });

  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success)
    return NextResponse.json({ error: "bad input" }, { status: 400 });
  const d = parsed.data;
  const item = await prisma.availability.create({
    data: {
      userId: session.user.id,
      startsAt: new Date(d.startsAt),
      endsAt: new Date(d.endsAt),
      label: d.label ?? null,
      kind: d.kind ?? "away",
    },
  });

  // Bump the Calendar "unread" bubble for this supervisor's students:
  // log an availability.create per affected student so /api/calendar/unread
  // counts it (label is intentionally not included — students never see it).
  const myStudents = await prisma.student.findMany({
    where: {
      OR: [
        { supervisorId: session.user.id },
        {
          coSupervisors: {
            some: {
              userId: session.user.id,
              role: { in: ["supervisor", "co_supervisor"] },
            },
          },
        },
      ],
    },
    select: { id: true },
  });
  if (myStudents.length > 0) {
    const { logActivity } = await import("@/lib/activity-log");
    await Promise.all(
      myStudents.map((s) =>
        logActivity({
          actorId: session.user.id,
          actorRole: session.user.role,
          studentId: s.id,
          action: "availability.create",
          entityType: "availability",
          entityId: item.id,
          summary: "marked a period unavailable",
        }),
      ),
    ).catch((err) => console.error("availability log failed", err));
  }

  return NextResponse.json({ item });
}

