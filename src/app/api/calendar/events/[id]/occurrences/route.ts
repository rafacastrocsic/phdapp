import { NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import {
  accessForStudent,
  canWriteForStudent,
  isAdmin,
  type Role,
} from "@/lib/access";
import { pushOccurrenceException } from "@/lib/recurrence-google";
import { logActivity } from "@/lib/activity-log";

// Exceptions to a repeating event: move ONE occurrence to another slot, or
// skip it. The series (Event + RRULE) is untouched — only this instance.

const Body = z.object({
  // Which occurrence, identified by its start before any move.
  originalStart: z.string(),
  cancelled: z.boolean().optional(),
  startsAt: z.string().nullable().optional(),
  endsAt: z.string().nullable().optional(),
  timeZone: z.string().nullable().optional(),
});

const DeleteBody = z.object({ originalStart: z.string() });

// Same rule as editing the event itself.
async function canWrite(
  eventOwnerId: string,
  studentId: string | null,
  userId: string,
  role: Role,
) {
  if (isAdmin(role)) return true;
  if (eventOwnerId === userId) return true;
  if (!studentId) return role === "supervisor";
  return canWriteForStudent(await accessForStudent(studentId, userId, role));
}

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "unauth" }, { status: 401 });
  const { id } = await params;
  const role = session.user.role as Role;

  const event = await prisma.event.findUnique({ where: { id } });
  if (!event) return NextResponse.json({ error: "not found" }, { status: 404 });
  if (!(await canWrite(event.ownerId, event.studentId, session.user.id, role)))
    return NextResponse.json(
      { error: "You don't have permission to edit this event" },
      { status: 403 },
    );
  if (!event.recurrenceRule)
    return NextResponse.json(
      { error: "This event doesn't repeat, so it has no occurrences to change." },
      { status: 400 },
    );

  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success)
    return NextResponse.json({ error: "bad input" }, { status: 400 });
  const d = parsed.data;

  const originalStart = new Date(d.originalStart);
  if (isNaN(originalStart.getTime()))
    return NextResponse.json({ error: "bad originalStart" }, { status: 400 });

  const cancelled = d.cancelled ?? false;
  const startsAt = d.startsAt ? new Date(d.startsAt) : null;
  const endsAt = d.endsAt ? new Date(d.endsAt) : null;
  if ((startsAt && isNaN(startsAt.getTime())) || (endsAt && isNaN(endsAt.getTime())))
    return NextResponse.json({ error: "bad date" }, { status: 400 });
  if (startsAt && endsAt && endsAt <= startsAt)
    return NextResponse.json(
      { error: "End time must be after the start time." },
      { status: 400 },
    );

  // Mirror it onto Google's own instance, so phones show the change too.
  let googleWarning: string | null = null;
  let googleEventId: string | null = null;
  if (event.googleEventId && event.googleCalendarId) {
    const res = await pushOccurrenceException({
      actingUserId: session.user.id,
      calendarId: event.googleCalendarId,
      masterGoogleEventId: event.googleEventId,
      originalStart,
      cancelled,
      startsAt,
      endsAt,
      timeZone: d.timeZone,
    });
    googleWarning = res.warning;
    googleEventId = res.googleEventId;
  }

  const row = await prisma.eventOccurrence.upsert({
    where: { eventId_originalStart: { eventId: id, originalStart } },
    create: {
      eventId: id,
      originalStart,
      cancelled,
      startsAt,
      endsAt,
      googleEventId,
    },
    update: {
      cancelled,
      startsAt,
      endsAt,
      ...(googleEventId ? { googleEventId } : {}),
    },
  });

  await logActivity({
    actorId: session.user.id,
    actorRole: session.user.role,
    studentId: event.studentId,
    action: "event.update",
    entityType: "event",
    entityId: id,
    summary: cancelled
      ? `skipped one occurrence of “${event.title}”`
      : `moved one occurrence of “${event.title}”`,
  }).catch(() => {});

  return NextResponse.json({
    ok: true,
    occurrence: {
      originalStart: row.originalStart.toISOString(),
      cancelled: row.cancelled,
      startsAt: row.startsAt?.toISOString() ?? null,
      endsAt: row.endsAt?.toISOString() ?? null,
    },
    googleWarning,
  });
}

// Restore an occurrence to the series default (drop the exception).
export async function DELETE(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "unauth" }, { status: 401 });
  const { id } = await params;
  const role = session.user.role as Role;

  const event = await prisma.event.findUnique({ where: { id } });
  if (!event) return NextResponse.json({ error: "not found" }, { status: 404 });
  if (!(await canWrite(event.ownerId, event.studentId, session.user.id, role)))
    return NextResponse.json({ error: "forbidden" }, { status: 403 });

  const parsed = DeleteBody.safeParse(await req.json().catch(() => null));
  if (!parsed.success)
    return NextResponse.json({ error: "bad input" }, { status: 400 });
  const originalStart = new Date(parsed.data.originalStart);
  if (isNaN(originalStart.getTime()))
    return NextResponse.json({ error: "bad originalStart" }, { status: 400 });

  await prisma.eventOccurrence
    .delete({ where: { eventId_originalStart: { eventId: id, originalStart } } })
    .catch(() => {});
  return NextResponse.json({ ok: true });
}
