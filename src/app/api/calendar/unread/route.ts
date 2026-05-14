import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { studentVisibilityWhereAllForAdmin, type Role } from "@/lib/access";
import { getDismissedEventIds } from "@/lib/calendar-dismissed";

export async function GET() {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ count: 0, highlightByEvent: {} });

  const me = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { calendarLastSeenAt: true },
  });
  const since = me?.calendarLastSeenAt ?? new Date(0);

  const visible = await prisma.student.findMany({
    where: studentVisibilityWhereAllForAdmin(session.user.id, session.user.role as Role),
    select: { id: true },
  });
  const studentIds = visible.map((s) => s.id);

  const dismissed = await getDismissedEventIds(session.user.id);

  const logs = await prisma.activityLog.findMany({
    where: {
      // Events about visible students, or unassigned events (studentId null)
      OR: [{ studentId: { in: studentIds } }, { studentId: null }],
      actorId: { not: session.user.id },
      action: { in: ["event.create", "event.update", "event.delete"] },
      createdAt: { gt: since },
      ...(dismissed.length > 0 ? { NOT: { entityId: { in: dismissed } } } : {}),
    },
    select: { entityId: true, action: true },
    orderBy: { createdAt: "asc" },
  });

  const highlightByEvent: Record<string, "new" | "updated"> = {};
  for (const l of logs) {
    if (!l.entityId) continue;
    if (l.action === "event.create") highlightByEvent[l.entityId] = "new";
    else if (l.action === "event.update" && !highlightByEvent[l.entityId])
      highlightByEvent[l.entityId] = "updated";
  }

  return NextResponse.json({ count: logs.length, highlightByEvent });
}
