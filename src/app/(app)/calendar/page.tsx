import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import {
  studentVisibilityWhere,
  studentVisibilityWhereAllForAdmin,
  type Role,
} from "@/lib/access";
import { clearDismissedEventIds } from "@/lib/calendar-dismissed";
import { CalendarView } from "./calendar-view";
import { startOfMonth, endOfMonth, subMonths, addMonths } from "date-fns";

export default async function CalendarPage({
  searchParams,
}: {
  searchParams: Promise<{ student?: string; month?: string }>;
}) {
  const sp = await searchParams;
  const session = (await auth())!;
  const role = session.user.role as Role;
  const monthBase = sp.month ? new Date(sp.month + "-01") : new Date();

  const students = await prisma.student.findMany({
    where: studentVisibilityWhere(session.user.id, role),
    select: { id: true, fullName: true, alias: true, color: true, calendarId: true },
    orderBy: { fullName: "asc" },
  });
  const studentIds = students.map((s) => s.id);

  const from = subMonths(startOfMonth(monthBase), 1);
  const to = addMonths(endOfMonth(monthBase), 1);

  const events = await prisma.event.findMany({
    where: {
      // Unassigned (general) events have studentId = null and must show for
      // everyone — otherwise they'd never appear after reload and the live
      // poll would flag a freshly-created one as "deleted".
      AND: [
        sp.student
          ? { studentId: sp.student }
          : { OR: [{ studentId: { in: studentIds } }, { studentId: null }] },
        // Recurring events are always loaded (their base startsAt may be far
        // in the past) and expanded client-side; one-offs are windowed.
        { OR: [{ startsAt: { gte: from, lte: to } }, { recurrenceRule: { not: null } }] },
      ],
    },
    include: {
      student: { select: { id: true, fullName: true, alias: true, color: true } },
      ticket: { select: { id: true, priority: true } },
    },
    orderBy: { startsAt: "asc" },
  });

  // Supervisor availability: the supervisors/team of the visible students.
  // Students see opaque "Unavailable" (no label); supervisors/admin see labels.
  const teamLinks = await prisma.student.findMany({
    where: { id: { in: studentIds } },
    select: {
      supervisorId: true,
      coSupervisors: { select: { userId: true } },
    },
  });
  const supervisorIds = Array.from(
    new Set(
      teamLinks.flatMap((s) => [
        s.supervisorId,
        ...s.coSupervisors.map((c) => c.userId),
      ]),
    ),
  );
  const showLabels = role !== "student";
  const availabilityRows = await prisma.availability.findMany({
    where: {
      userId: { in: supervisorIds },
      startsAt: { lte: to },
      endsAt: { gte: from },
    },
    include: { user: { select: { id: true, name: true } } },
    orderBy: { startsAt: "asc" },
  });
  const availability = availabilityRows.map((a) => ({
    id: a.id,
    startsAt: a.startsAt.toISOString(),
    endsAt: a.endsAt.toISOString(),
    who: a.user.name ?? "A supervisor",
    label: showLabels ? a.label : null,
    kind: a.kind,
  }));
  const myAvailability =
    role === "student"
      ? []
      : availabilityRows
          .filter((a) => a.userId === session.user.id)
          .map((a) => ({
            id: a.id,
            startsAt: a.startsAt.toISOString(),
            endsAt: a.endsAt.toISOString(),
            label: a.label,
            kind: a.kind,
          }));

  // For student-role viewers, their own studentId so the new-event dialog can
  // hide the student picker and just attach the event to themselves.
  const viewerStudent =
    role === "student"
      ? await prisma.student.findFirst({
          where: { userId: session.user.id },
          select: { id: true },
        })
      : null;

  // Snapshot which events have been touched by others since the user's last
  // calendar visit, then bump the "seen" timestamp and clear dismissals.
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
  const recentEventLogs = await prisma.activityLog.findMany({
    where: {
      OR: [{ studentId: { in: allVisibleStudentIds } }, { studentId: null }],
      actorId: { not: session.user.id },
      action: { in: ["event.create", "event.update"] },
      createdAt: { gt: since },
    },
    select: { entityId: true, action: true },
    orderBy: { createdAt: "asc" },
  });
  const highlightByEvent: Record<string, "new" | "updated"> = {};
  for (const l of recentEventLogs) {
    if (!l.entityId) continue;
    if (l.action === "event.create") highlightByEvent[l.entityId] = "new";
    else if (!highlightByEvent[l.entityId])
      highlightByEvent[l.entityId] = "updated";
  }

  await prisma.user.update({
    where: { id: session.user.id },
    data: { calendarLastSeenAt: new Date() },
  });
  await clearDismissedEventIds(session.user.id);

  return (
    <CalendarView
      viewerRole={role}
      viewerStudentId={viewerStudent?.id ?? null}
      students={students}
      events={events.map((e) => ({
        id: e.id,
        title: e.title,
        description: e.description,
        location: e.location,
        startsAt: e.startsAt.toISOString(),
        endsAt: e.endsAt.toISOString(),
        meetingUrl: e.meetingUrl,
        recurrenceRule: e.recurrenceRule,
        isMeeting: e.isMeeting,
        agenda: e.agenda,
        meetingNotes: e.meetingNotes,
        student: e.student,
        googleEventId: e.googleEventId,
        googleCalendarId: e.googleCalendarId,
        ticketId: e.ticketId,
        taskPriority: e.ticket?.priority ?? null,
      }))}
      availability={availability}
      myAvailability={myAvailability}
      initialStudent={sp.student ?? null}
      initialMonth={sp.month ?? null}
      highlightByEvent={highlightByEvent}
    />
  );
}
