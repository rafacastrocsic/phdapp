import { NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { calendarForUser } from "@/lib/google";
import {
  accessForStudent,
  canWriteForStudent,
  studentVisibilityWhereAllForAdmin,
  isAdmin,
  type Role,
} from "@/lib/access";
import { logActivity } from "@/lib/activity-log";
import { LinkInput, sanitiseLinks } from "@/lib/links";

async function loadEvent(id: string) {
  return prisma.event.findUnique({ where: { id } });
}

async function callerCanWrite(
  eventOwnerId: string,
  studentId: string | null,
  userId: string,
  role: Role,
) {
  if (eventOwnerId === userId) return true;
  if (!studentId) return role === "supervisor";
  const a = await accessForStudent(studentId, userId, role);
  return canWriteForStudent(a);
}

const Patch = z.object({
  title: z.string().optional(),
  description: z.string().nullable().optional(),
  location: z.string().nullable().optional(),
  meetingUrl: z.string().nullable().optional(),
  date: z.string().optional(),
  startTime: z.string().optional(),
  endTime: z.string().optional(),
  // Preferred: full ISO instants computed on the client (timezone-correct).
  startsAt: z.string().optional(),
  endsAt: z.string().optional(),
  recurrenceRule: z.string().nullable().optional(),
  isMeeting: z.boolean().optional(),
  agenda: z
    .array(z.object({ id: z.string(), text: z.string() }))
    .optional(),
  meetingNotes: z.string().nullable().optional(),
  pushToGoogle: z.boolean().optional(),
  // Manual task link: a task id to link, or null to unlink.
  linkedTaskId: z.string().nullable().optional(),
  // Re-assign the event to a student (or null = unassigned/general).
  studentId: z.string().nullable().optional(),
  // Replace the external-links list (empty array clears).
  links: z.array(LinkInput).optional(),
  // Single Drive folder URL (or null to clear).
  driveFolderUrl: z.string().nullable().optional(),
});

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "unauth" }, { status: 401 });

  const { id } = await params;
  const event = await loadEvent(id);
  if (!event) return NextResponse.json({ error: "not found" }, { status: 404 });

  if (
    !(await callerCanWrite(event.ownerId, event.studentId, session.user.id, session.user.role as Role))
  )
    return NextResponse.json(
      { error: "You don't have permission to edit this event" },
      { status: 403 },
    );

  const json = await req.json().catch(() => null);
  const parsed = Patch.safeParse(json);
  if (!parsed.success) return NextResponse.json({ error: "bad input" }, { status: 400 });
  const d = parsed.data;

  const data: Record<string, unknown> = {};
  if (d.title !== undefined) data.title = d.title;
  if (d.description !== undefined) data.description = d.description;
  if (d.location !== undefined) data.location = d.location;
  if (d.meetingUrl !== undefined) data.meetingUrl = d.meetingUrl;
  if (d.recurrenceRule !== undefined) data.recurrenceRule = d.recurrenceRule;
  if (d.isMeeting !== undefined) data.isMeeting = d.isMeeting;
  if (d.agenda !== undefined) data.agenda = JSON.stringify(d.agenda);
  if (d.meetingNotes !== undefined) data.meetingNotes = d.meetingNotes;
  if (d.links !== undefined) {
    const sane = sanitiseLinks(d.links);
    data.links = sane.length > 0 ? JSON.stringify(sane) : null;
  }
  if (d.driveFolderUrl !== undefined) {
    data.driveFolderUrl = d.driveFolderUrl || null;
  }
  if (d.linkedTaskId !== undefined) {
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
    data.linkedTaskId = linkedTaskId;
  }

  // Re-assign the event to a student (or unassign → General calendar).
  if (d.studentId !== undefined) {
    const newStudentId = d.studentId || null;
    if (newStudentId) {
      const access = await accessForStudent(
        newStudentId,
        session.user.id,
        session.user.role as Role,
      );
      if (!canWriteForStudent(access))
        return NextResponse.json(
          { error: "You can only assign events to your own students" },
          { status: 403 },
        );
    } else if (
      session.user.role !== "supervisor" &&
      !isAdmin(session.user.role)
    ) {
      return NextResponse.json(
        { error: "Only supervisors can make an event unassigned" },
        { status: 403 },
      );
    }
    data.studentId = newStudentId;
  }

  // Prefer client-computed ISO instants (timezone-correct). Otherwise fall
  // back to recomputing from wall-clock date/time strings.
  if (d.startsAt || d.endsAt) {
    if (d.startsAt) {
      const s = new Date(d.startsAt);
      if (isNaN(s.getTime()))
        return NextResponse.json({ error: "bad startsAt" }, { status: 400 });
      data.startsAt = s;
    }
    if (d.endsAt) {
      const e = new Date(d.endsAt);
      if (isNaN(e.getTime()))
        return NextResponse.json({ error: "bad endsAt" }, { status: 400 });
      data.endsAt = e;
    }
  } else if (d.date || d.startTime || d.endTime) {
    const date = d.date ?? event.startsAt.toISOString().slice(0, 10);
    const startTime =
      d.startTime ?? event.startsAt.toISOString().slice(11, 16);
    const endTime = d.endTime ?? event.endsAt.toISOString().slice(11, 16);
    data.startsAt = new Date(`${date}T${startTime}:00`);
    data.endsAt = new Date(`${date}T${endTime}:00`);
  }

  let googleWarning: string | null = null;
  if (d.pushToGoogle && event.googleEventId && event.googleCalendarId) {
    const cal = await calendarForUser(session.user.id);
    if (cal) {
      try {
        await cal.events.patch({
          calendarId: event.googleCalendarId,
          eventId: event.googleEventId,
          requestBody: {
            summary: (data.title as string | undefined) ?? event.title,
            description:
              (data.description as string | null | undefined) ?? event.description ?? undefined,
            location:
              (data.location as string | null | undefined) ?? event.location ?? undefined,
            start: data.startsAt
              ? { dateTime: (data.startsAt as Date).toISOString() }
              : undefined,
            end: data.endsAt
              ? { dateTime: (data.endsAt as Date).toISOString() }
              : undefined,
            recurrence:
              d.recurrenceRule !== undefined
                ? d.recurrenceRule
                  ? [`RRULE:${d.recurrenceRule}`]
                  : []
                : undefined,
          },
          sendUpdates: "all",
        });
      } catch (err) {
        googleWarning = (err as Error).message ?? "Google update failed";
      }
    } else {
      googleWarning = "Google account not linked — updated locally only.";
    }
  }

  await prisma.event.update({ where: { id }, data });

  await logActivity({
    actorId: session.user.id,
    actorRole: session.user.role,
    studentId: event.studentId,
    action: "event.update",
    entityType: "event",
    entityId: id,
    summary: `updated event “${event.title}”`,
    details: data,
  });

  return NextResponse.json({ ok: true, googleWarning });
}

export async function DELETE(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "unauth" }, { status: 401 });

  const { id } = await params;
  const event = await loadEvent(id);
  if (!event) return NextResponse.json({ error: "not found" }, { status: 404 });

  if (
    !(await callerCanWrite(event.ownerId, event.studentId, session.user.id, session.user.role as Role))
  )
    return NextResponse.json(
      { error: "You don't have permission to delete this event" },
      { status: 403 },
    );

  const url = new URL(req.url);
  const alsoGoogle = url.searchParams.get("google") === "1";

  let googleWarning: string | null = null;
  if (alsoGoogle && event.googleEventId && event.googleCalendarId) {
    const cal = await calendarForUser(session.user.id);
    if (!cal) {
      googleWarning = "Google account not linked — only deleted locally.";
    } else {
      try {
        await cal.events.delete({
          calendarId: event.googleCalendarId,
          eventId: event.googleEventId,
          sendUpdates: "all",
        });
      } catch (err) {
        const e = err as { message?: string; code?: number; status?: number };
        const msg = e.message ?? "unknown";
        const code = e.code ?? e.status ?? "?";
        if (code !== 404 && code !== 410) {
          googleWarning = `Removed locally but Google delete failed (${code}): ${msg}`;
        }
      }
    }
  }

  await prisma.event.delete({ where: { id } });

  await logActivity({
    actorId: session.user.id,
    actorRole: session.user.role,
    studentId: event.studentId,
    action: "event.delete",
    entityType: "event",
    entityId: id,
    summary: `deleted event “${event.title}”`,
  });

  return NextResponse.json({ ok: true, googleWarning });
}
