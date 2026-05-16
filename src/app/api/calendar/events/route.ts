import { NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { calendarForUser } from "@/lib/google";
import { normalizeCalendarId } from "@/lib/calendar-id";
import { accessForStudent, canWriteForStudent, isAdmin, type Role } from "@/lib/access";
import { logActivity } from "@/lib/activity-log";

const Body = z.object({
  title: z.string().min(1),
  date: z.string(),
  startTime: z.string(),
  endTime: z.string(),
  studentId: z.string().optional().nullable(),
  location: z.string().optional().nullable(),
  meetingUrl: z.string().optional().nullable(),
  description: z.string().optional().nullable(),
  recurrenceRule: z.string().optional().nullable(),
  isMeeting: z.string().optional(),
  pushToGoogle: z.string().optional(),
});

export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "unauth" }, { status: 401 });

  const json = await req.json().catch(() => null);
  const parsed = Body.safeParse(json);
  if (!parsed.success) return NextResponse.json({ error: "bad input" }, { status: 400 });
  const d = parsed.data;

  const startsAt = new Date(`${d.date}T${d.startTime}:00`);
  const endsAt = new Date(`${d.date}T${d.endTime}:00`);

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
      const targetCalendarId = normalizeCalendarId(student?.calendarId) || "primary";
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
              `You don't have write access to ${student?.fullName ?? "the linked"}'s calendar, ` +
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
      googleEventId,
      googleCalendarId,
    },
    include: { student: { select: { id: true, fullName: true, alias: true, color: true } } },
  });

  await logActivity({
    actorId: session.user.id,
    actorRole: session.user.role,
    studentId: event.studentId,
    action: "event.create",
    entityType: "event",
    entityId: event.id,
    summary: `scheduled event “${event.title}” on ${event.startsAt.toISOString().slice(0, 16).replace("T", " ")}`,
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
    },
    googleWarning,
    pushedToGoogle: !!googleEventId,
  });
}
