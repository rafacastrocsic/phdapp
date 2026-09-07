import { NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { calendarForUser } from "@/lib/google";
import { normalizeCalendarId } from "@/lib/calendar-id";

/**
 * Create an event on the signed-in user's OWN workspace calendar (their
 * personal Google calendar registered as `user.calendarId`). This is the
 * path a Project Researcher uses to schedule on their own calendar from
 * inside PhDapp — they are read-only on their students, so they cannot POST
 * a student-tied event, but they can put events on their own calendar (and
 * on the General calendar, via the regular events route).
 *
 * No PhDapp Event row is created: the researcher's calendar is mirrored into
 * the Calendar module read-only from Google, so the event shows up there on
 * the next load. Single source of truth = Google.
 */
const Body = z.object({
  title: z.string().min(1),
  startsAt: z.string(),
  endsAt: z.string(),
  location: z.string().optional().nullable(),
  description: z.string().optional().nullable(),
  recurrenceRule: z.string().optional().nullable(),
  timeZone: z.string().optional().nullable(),
});

export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "unauth" }, { status: 401 });

  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success)
    return NextResponse.json({ error: "bad input" }, { status: 400 });
  const d = parsed.data;

  const startsAt = new Date(d.startsAt);
  const endsAt = new Date(d.endsAt);
  if (isNaN(startsAt.getTime()) || isNaN(endsAt.getTime()) || endsAt <= startsAt)
    return NextResponse.json({ error: "bad date/time" }, { status: 400 });

  const me = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { calendarId: true },
  });
  const calendarId = normalizeCalendarId(me?.calendarId);
  if (!calendarId)
    return NextResponse.json(
      {
        error:
          "You don't have a workspace calendar yet — create one in Settings → My workspace.",
      },
      { status: 400 },
    );

  const cal = await calendarForUser(session.user.id);
  if (!cal)
    return NextResponse.json(
      {
        error:
          "Google account not linked — sign out and back in to reconnect Google.",
      },
      { status: 400 },
    );

  const tz = (d.timeZone && d.timeZone.trim()) || "UTC";
  try {
    const r = await cal.events.insert({
      calendarId,
      requestBody: {
        summary: d.title,
        description: d.description ?? undefined,
        location: d.location ?? undefined,
        start: { dateTime: startsAt.toISOString(), timeZone: tz },
        end: { dateTime: endsAt.toISOString(), timeZone: tz },
        recurrence: d.recurrenceRule ? [`RRULE:${d.recurrenceRule}`] : undefined,
      },
    });
    return NextResponse.json({ ok: true, googleEventId: r.data.id ?? null });
  } catch (err) {
    const e = err as { message?: string; code?: number; status?: number };
    return NextResponse.json(
      {
        error: `Could not add the event to your workspace calendar: ${
          e.message ?? "unknown"
        } (${e.code ?? e.status ?? "?"}).`,
      },
      { status: 500 },
    );
  }
}
