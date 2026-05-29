import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import {
  studentVisibilityWhere,
  studentVisibilityWhereAllForAdmin,
  type Role,
} from "@/lib/access";
import { clearDismissedEventIds } from "@/lib/calendar-dismissed";
import { displayName } from "@/lib/utils";
import { getTeamDriveFolder } from "@/lib/team-drive";
import { getHolidaysInRange } from "@/lib/holidays";
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
    select: {
      id: true,
      fullName: true,
      alias: true,
      color: true,
      calendarId: true,
      driveFolderId: true,
    },
    orderBy: { fullName: "asc" },
  });
  const studentIds = students.map((s) => s.id);

  const from = subMonths(startOfMonth(monthBase), 1);
  const to = addMonths(endOfMonth(monthBase), 1);

  const events = await prisma.event.findMany({
    where: {
      // Visibility (two states only — student-specific or general):
      //   students      → own students + general events
      //   non-students  → visible students + general events
      // Any legacy team-only rows (studentId null + isGeneral false) are
      // filtered out everywhere — they're not surfaced anywhere.
      AND: [
        sp.student
          ? { studentId: sp.student }
          : {
              OR: [
                { studentId: { in: studentIds } },
                { studentId: null, isGeneral: true },
              ],
            },
        // Recurring events are always loaded (their base startsAt may be far
        // in the past) and expanded client-side; one-offs are windowed.
        { OR: [{ startsAt: { gte: from, lte: to } }, { recurrenceRule: { not: null } }] },
      ],
    },
    include: {
      student: { select: { id: true, fullName: true, alias: true, color: true } },
      ticket: { select: { id: true, priority: true } },
      linkedTask: { select: { id: true, title: true } },
    },
    orderBy: { startsAt: "asc" },
  });

  // Tasks the user may link an event to (visible, non-archived). Powers the
  // task picker in the new/edit-event dialogs.
  const linkableTasks = await prisma.ticket.findMany({
    where: {
      archivedAt: null,
      student: studentVisibilityWhereAllForAdmin(session.user.id, role),
    },
    select: {
      id: true,
      title: true,
      status: true,
      student: { select: { id: true, fullName: true, alias: true } },
    },
    orderBy: [{ student: { fullName: "asc" } }, { createdAt: "desc" }],
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

  // Admin-configured team Drive folder — exposed to non-students so they
  // can pick it as one of the roots for unassigned events.
  const teamDrive = role === "student" ? null : await getTeamDriveFolder();

  return (
    <CalendarView
      viewerRole={role}
      viewerStudentId={viewerStudent?.id ?? null}
      students={students}
      teamDriveFolderId={teamDrive?.id ?? null}
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
        linkedTaskId: e.linkedTaskId,
        linkedTaskTitle: e.linkedTask?.title ?? null,
        links: e.links,
        driveFolderUrl: e.driveFolderUrl,
        isGeneral: e.isGeneral,
        allDay: e.allDay,
        subtaskParentId: e.subtaskParentId,
      }))}
      tasks={linkableTasks
        // Team-only / unassigned tasks are filtered out of the link picker
        // for now — keeps the per-student scoping logic clean. They can
        // still appear if/when we extend LinkableTask to allow null student.
        .filter((t) => t.student !== null)
        .map((t) => ({
          id: t.id,
          title: t.title,
          status: t.status,
          studentId: t.student!.id,
          studentName: displayName(t.student!),
        }))}
      availability={availability}
      myAvailability={myAvailability}
      initialStudent={sp.student ?? null}
      initialMonth={sp.month ?? null}
      highlightByEvent={highlightByEvent}
      // Sevilla public holidays for the full current year + next year
      // (~32 rows; tiny payload). The events query is bounded to a
      // 3-month window for size reasons, but holidays should cover the
      // whole year so the Year-view mini grid is complete and so that
      // client-side month navigation doesn't run out of holiday data
      // a few months past the initial load.
      holidays={getHolidaysInRange(
        new Date(monthBase.getFullYear(), 0, 1),
        new Date(monthBase.getFullYear() + 2, 0, 1),
      ).map((h) => ({
        date: h.date.toISOString(),
        name: h.name,
      }))}
    />
  );
}
