import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import {
  studentVisibilityWhere,
  studentVisibilityWhereAllForAdmin,
  type Role,
} from "@/lib/access";
import { getDismissedEventIds } from "@/lib/calendar-dismissed";

/**
 * Polled by the CalendarView client to refresh events + highlights without a
 * full page reload. Does NOT touch calendarLastSeenAt, so highlights persist
 * between calls until the user revisits /calendar.
 */
export async function GET(req: Request) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "unauth" }, { status: 401 });

  const url = new URL(req.url);
  const from = url.searchParams.get("from");
  const to = url.searchParams.get("to");
  const studentFilter = url.searchParams.get("student");

  const role = session.user.role as Role;

  const visible = await prisma.student.findMany({
    where: studentVisibilityWhere(session.user.id, role),
    select: { id: true },
  });
  const studentIds = visible.map((s) => s.id);

  const where: Record<string, unknown> = {
    ...(studentFilter
      ? { studentId: studentFilter }
      : { studentId: { in: studentIds } }),
  };
  if (from || to) {
    // Recurring events always loaded (expanded client-side); one-offs windowed.
    where.OR = [
      {
        startsAt: {
          ...(from ? { gte: new Date(from) } : {}),
          ...(to ? { lte: new Date(to) } : {}),
        },
      },
      { recurrenceRule: { not: null } },
    ];
  }

  const events = await prisma.event.findMany({
    where,
    include: {
      student: { select: { id: true, fullName: true, alias: true, color: true } },
      ticket: { select: { id: true, priority: true } },
    },
    orderBy: { startsAt: "asc" },
  });

  // Highlights map (mirrors /calendar page logic)
  const me = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { calendarLastSeenAt: true },
  });
  const since = me?.calendarLastSeenAt ?? new Date(0);

  const allVisibleStudents = await prisma.student.findMany({
    where: studentVisibilityWhereAllForAdmin(session.user.id, role),
    select: { id: true },
  });
  const allVisibleStudentIds = allVisibleStudents.map((s) => s.id);

  const dismissed = await getDismissedEventIds(session.user.id);
  const recentLogs = await prisma.activityLog.findMany({
    where: {
      OR: [{ studentId: { in: allVisibleStudentIds } }, { studentId: null }],
      actorId: { not: session.user.id },
      action: { in: ["event.create", "event.update"] },
      createdAt: { gt: since },
      ...(dismissed.length > 0 ? { NOT: { entityId: { in: dismissed } } } : {}),
    },
    select: { entityId: true, action: true },
    orderBy: { createdAt: "asc" },
  });

  const highlightByEvent: Record<string, "new" | "updated"> = {};
  for (const l of recentLogs) {
    if (!l.entityId) continue;
    if (l.action === "event.create") highlightByEvent[l.entityId] = "new";
    else if (!highlightByEvent[l.entityId])
      highlightByEvent[l.entityId] = "updated";
  }

  return NextResponse.json({
    events: events.map((e) => ({
      id: e.id,
      title: e.title,
      description: e.description,
      location: e.location,
      startsAt: e.startsAt.toISOString(),
      endsAt: e.endsAt.toISOString(),
      meetingUrl: e.meetingUrl,
      recurrenceRule: e.recurrenceRule,
      student: e.student,
      googleEventId: e.googleEventId,
      googleCalendarId: e.googleCalendarId,
      ticketId: e.ticketId,
      taskPriority: e.ticket?.priority ?? null,
    })),
    highlightByEvent,
  });
}
