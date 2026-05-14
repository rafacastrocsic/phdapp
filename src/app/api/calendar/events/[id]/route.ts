import { NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { calendarForUser } from "@/lib/google";
import {
  accessForStudent,
  canWriteForStudent,
  type Role,
} from "@/lib/access";
import { logActivity } from "@/lib/activity-log";

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
  pushToGoogle: z.boolean().optional(),
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

  // If user changed date or times, recompute starts/ends.
  if (d.date || d.startTime || d.endTime) {
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
