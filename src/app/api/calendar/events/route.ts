import { NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { calendarForUser } from "@/lib/google";
import { normalizeCalendarId } from "@/lib/calendar-id";
import { getGeneralCalendarId } from "@/lib/general-calendar";
import {
  accessForStudent,
  canWriteForStudent,
  isAdmin,
  studentVisibilityWhereAllForAdmin,
  type Role,
} from "@/lib/access";
import { logActivity } from "@/lib/activity-log";
import { LinkInput, sanitiseLinks } from "@/lib/links";

const Body = z.object({
  title: z.string().min(1),
  date: z.string(),
  startTime: z.string(),
  endTime: z.string(),
  // Preferred: full ISO instants computed on the client (which knows the
  // user's timezone). Server falls back to date+time strings if absent.
  startsAt: z.string().optional(),
  endsAt: z.string().optional(),
  studentId: z.string().optional().nullable(),
  location: z.string().optional().nullable(),
  meetingUrl: z.string().optional().nullable(),
  description: z.string().optional().nullable(),
  recurrenceRule: z.string().optional().nullable(),
  isMeeting: z.string().optional(),
  pushToGoogle: z.string().optional(),
  // Optional manual link to a task this event relates to.
  linkedTaskId: z.string().optional().nullable(),
  // Optional list of external links {label, url}.
  links: z.array(LinkInput).optional(),
  // Optional single Drive folder URL.
  driveFolderUrl: z.string().optional().nullable(),
  // When studentId is null: false = team-only, true = general (visible
  // to everyone). Ignored if studentId is set.
  isGeneral: z.boolean().optional(),
});

export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "unauth" }, { status: 401 });

  const json = await req.json().catch(() => null);
  const parsed = Body.safeParse(json);
  if (!parsed.success) return NextResponse.json({ error: "bad input" }, { status: 400 });
  const d = parsed.data;

  // Prefer the client-computed instants (correct for the user's timezone);
  // fall back to interpreting the wall-clock strings server-side.
  const startsAt = d.startsAt
    ? new Date(d.startsAt)
    : new Date(`${d.date}T${d.startTime}:00`);
  const endsAt = d.endsAt
    ? new Date(d.endsAt)
    : new Date(`${d.date}T${d.endTime}:00`);
  if (isNaN(startsAt.getTime()) || isNaN(endsAt.getTime()))
    return NextResponse.json({ error: "bad date/time" }, { status: 400 });

  // Anyone linked to the student can create events for them; unassigned events are supervisor-only
  if (d.studentId) {
    const access = await accessForStudent(
      d.studentId,
      session.user.id,
      session.user.role as Role,
    );
    if (!canWriteForStudent(access))
      return NextResponse.json(
        { error: "You can only create events for your own students" },
        { status: 403 },
      );
  } else if (session.user.role !== "supervisor" && !isAdmin(session.user.role)) {
    return NextResponse.json(
      { error: "Only supervisors can create unassigned events" },
      { status: 403 },
    );
  }

  // Validate an optional manual task link: the task must exist, be live,
  // and be visible to this user.
  const linkedTaskId = d.linkedTaskId || null;
  if (linkedTaskId) {
    const tk = await prisma.ticket.findFirst({
      where: {
        id: linkedTaskId,
        archivedAt: null,
        student: studentVisibilityWhereAllForAdmin(
          session.user.id,
          session.user.role as Role,
        ),
      },
      select: { id: true },
    });
    if (!tk)
      return NextResponse.json(
        { error: "Linked task not found or not visible to you" },
        { status: 400 },
      );
  }

  const student = d.studentId
    ? await prisma.student.findUnique({ where: { id: d.studentId } })
    : null;

  let googleEventId: string | null = null;
  let googleCalendarId: string | null = null;
  let googleWarning: string | null = null;
  if (d.pushToGoogle === "1") {
    const cal = await calendarForUser(session.user.id);
    if (!cal) {
      googleWarning =
        "Google account not linked — event saved locally only. Sign out and back in to reconnect Google.";
    } else {
      // Assigned → that student's shared calendar; unassigned → the
      // admin-configured General calendar; else the creator's primary.
      const targetCalendarId =
        normalizeCalendarId(student?.calendarId) ||
        (await getGeneralCalendarId()) ||
        "primary";
      const requestBody = {
        summary: d.title,
        description: d.description ?? undefined,
        location: d.location ?? undefined,
        start: { dateTime: startsAt.toISOString() },
        end: { dateTime: endsAt.toISOString() },
        attendees: student ? [{ email: student.email }] : undefined,
        recurrence: d.recurrenceRule ? [`RRULE:${d.recurrenceRule}`] : undefined,
      };
      try {
        const r = await cal.events.insert({
          calendarId: targetCalendarId,
          requestBody,
          sendUpdates: student ? "all" : "none",
        });
        googleEventId = r.data.id ?? null;
        googleCalendarId = targetCalendarId;
      } catch (err) {
        const e = err as {
          message?: string;
          code?: number;
          status?: number;
          response?: { data?: unknown };
        };
        const msg = e.message ?? "unknown";
        const code = e.code ?? e.status ?? "?";

        // 403 with a "writer access" issue means the user can SEE the calendar
        // but can't write to it. Fall back to their primary calendar so the
        // event is at least on Google somewhere, and report what happened.
        const isAccessIssue =
          code === 403 && targetCalendarId !== "primary";

        if (isAccessIssue) {
          try {
            const r2 = await cal.events.insert({
              calendarId: "primary",
              requestBody,
              sendUpdates: student ? "all" : "none",
            });
            googleEventId = r2.data.id ?? null;
            googleCalendarId = "primary";
            googleWarning =
              `You don't have write access to ${(student?.alias?.trim() || student?.fullName) ?? "the linked"}'s calendar, ` +
              `so the event was added to your own primary Google Calendar instead. ` +
              `Ask them to share their calendar with you with permission "Make changes to events" ` +
              `to push events directly to it next time.`;
          } catch (err2) {
            const e2 = err2 as { message?: string; code?: number; status?: number };
            googleWarning =
              `Could not push to either calendar. Original target ("${targetCalendarId}") returned 403; ` +
              `fallback to your primary also failed: ${e2.message ?? "unknown"} (${e2.code ?? e2.status ?? "?"}).`;
            console.error("Google calendar fallback also failed", err2);
          }
        } else {
          const body =
            e.response?.data
              ? ` body=${JSON.stringify(e.response.data).slice(0, 300)}`
              : "";
          console.error("Google calendar push failed", err);
          googleWarning = `Could not push to Google Calendar (target id: "${targetCalendarId}", http ${code}): ${msg}${body}.`;
        }
      }
    }
  }

  const event = await prisma.event.create({
    data: {
      title: d.title,
      description: d.description || null,
      location: d.location || null,
      meetingUrl: d.meetingUrl || null,
      startsAt,
      endsAt,
      recurrenceRule: d.recurrenceRule || null,
      isMeeting: d.isMeeting === "1",
      ownerId: session.user.id,
      studentId: d.studentId || null,
      linkedTaskId,
      googleEventId,
      googleCalendarId,
      links: d.links && d.links.length > 0
        ? JSON.stringify(sanitiseLinks(d.links))
        : null,
      driveFolderUrl: d.driveFolderUrl || null,
      // isGeneral only meaningful for studentId=null.
      isGeneral: d.studentId ? false : d.isGeneral === true,
    },
    include: {
      student: { select: { id: true, fullName: true, alias: true, color: true } },
      linkedTask: { select: { id: true, title: true } },
    },
  });

  await logActivity({
    actorId: session.user.id,
    actorRole: session.user.role,
    studentId: event.studentId,
    action: "event.create",
    entityType: "event",
    entityId: event.id,
    // ISO marker — rendered client-side in the viewer's timezone by
    // <LocalTimeText>. Stored as UTC ISO; bell/log substitute on render.
    summary: `scheduled event “${event.title}” on [[${event.startsAt.toISOString()}]]`,
  });

  return NextResponse.json({
    event: {
      id: event.id,
      title: event.title,
      description: event.description,
      location: event.location,
      startsAt: event.startsAt.toISOString(),
      endsAt: event.endsAt.toISOString(),
      meetingUrl: event.meetingUrl,
      student: event.student,
      googleEventId: event.googleEventId,
      googleCalendarId: event.googleCalendarId,
      linkedTaskId: event.linkedTaskId,
      linkedTaskTitle: event.linkedTask?.title ?? null,
    },
    googleWarning,
    pushedToGoogle: !!googleEventId,
  });
}
