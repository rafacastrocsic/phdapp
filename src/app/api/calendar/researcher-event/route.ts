import { NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { calendarForUser } from "@/lib/google";
import { normalizeCalendarId } from "@/lib/calendar-id";
import { isAdmin, isProjectResearcherAnywhere, type Role } from "@/lib/access";

/**
 * Create / edit / delete an event on a Project Researcher's own workspace
 * Google calendar. Those calendars are mirrored read-only into PhDapp, so
 * there's no DB Event row — the change is made straight on Google (via the
 * researcher's own token, which always owns the calendar) and shows up in the
 * module on the next load.
 *
 * Allowed for an ADMIN (manage any researcher's calendar) or the researcher
 * themselves (their own). Everyone else: 403.
 */
const Base = z.object({
  researcherId: z.string().min(1),
});
const Create = Base.extend({
  title: z.string().min(1),
  startsAt: z.string(),
  endsAt: z.string(),
  location: z.string().optional().nullable(),
  description: z.string().optional().nullable(),
  recurrenceRule: z.string().optional().nullable(),
  timeZone: z.string().optional().nullable(),
});
const Patch = Create.extend({ googleEventId: z.string().min(1) });
const Delete = Base.extend({ googleEventId: z.string().min(1) });

async function gate(researcherId: string) {
  const session = await auth();
  if (!session?.user) return { error: "unauth" as const, status: 401 };
  const admin = isAdmin(session.user.role as Role);
  const isSelf = session.user.id === researcherId;
  if (!admin && !isSelf)
    return { error: "forbidden" as const, status: 403 };
  // Confirm the target is actually a project researcher with a calendar.
  if (!(await isProjectResearcherAnywhere(researcherId)))
    return { error: "Not a project researcher." as const, status: 400 };
  const u = await prisma.user.findUnique({
    where: { id: researcherId },
    select: { calendarId: true },
  });
  const calendarId = normalizeCalendarId(u?.calendarId);
  if (!calendarId)
    return {
      error: "That researcher has no workspace calendar yet." as const,
      status: 400,
    };
  const cal = await calendarForUser(researcherId);
  if (!cal)
    return {
      error: "The researcher's Google account isn't linked." as const,
      status: 400,
    };
  return { cal, calendarId };
}

function body(d: z.infer<typeof Create>) {
  const tz = (d.timeZone && d.timeZone.trim()) || "UTC";
  return {
    summary: d.title,
    description: d.description ?? undefined,
    location: d.location ?? undefined,
    start: { dateTime: new Date(d.startsAt).toISOString(), timeZone: tz },
    end: { dateTime: new Date(d.endsAt).toISOString(), timeZone: tz },
    recurrence: d.recurrenceRule ? [`RRULE:${d.recurrenceRule}`] : undefined,
  };
}

export async function POST(req: Request) {
  const parsed = Create.safeParse(await req.json().catch(() => null));
  if (!parsed.success)
    return NextResponse.json({ error: "bad input" }, { status: 400 });
  const g = await gate(parsed.data.researcherId);
  if ("error" in g) return NextResponse.json({ error: g.error }, { status: g.status });
  try {
    const r = await g.cal.events.insert({
      calendarId: g.calendarId,
      requestBody: body(parsed.data),
    });
    return NextResponse.json({ ok: true, googleEventId: r.data.id ?? null });
  } catch (err) {
    return NextResponse.json(
      { error: `Could not create the event: ${(err as Error).message ?? "unknown"}` },
      { status: 500 },
    );
  }
}

export async function PATCH(req: Request) {
  const parsed = Patch.safeParse(await req.json().catch(() => null));
  if (!parsed.success)
    return NextResponse.json({ error: "bad input" }, { status: 400 });
  const g = await gate(parsed.data.researcherId);
  if ("error" in g) return NextResponse.json({ error: g.error }, { status: g.status });
  try {
    await g.cal.events.patch({
      calendarId: g.calendarId,
      eventId: parsed.data.googleEventId,
      requestBody: body(parsed.data),
    });
    return NextResponse.json({ ok: true });
  } catch (err) {
    return NextResponse.json(
      { error: `Could not update the event: ${(err as Error).message ?? "unknown"}` },
      { status: 500 },
    );
  }
}

export async function DELETE(req: Request) {
  const parsed = Delete.safeParse(await req.json().catch(() => null));
  if (!parsed.success)
    return NextResponse.json({ error: "bad input" }, { status: 400 });
  const g = await gate(parsed.data.researcherId);
  if ("error" in g) return NextResponse.json({ error: g.error }, { status: g.status });
  try {
    await g.cal.events.delete({
      calendarId: g.calendarId,
      eventId: parsed.data.googleEventId,
    });
    return NextResponse.json({ ok: true });
  } catch (err) {
    const e = err as { code?: number; status?: number; message?: string };
    const code = e.code ?? e.status ?? 0;
    if (code === 404 || code === 410) return NextResponse.json({ ok: true }); // already gone
    return NextResponse.json(
      { error: `Could not delete the event: ${e.message ?? "unknown"}` },
      { status: 500 },
    );
  }
}
