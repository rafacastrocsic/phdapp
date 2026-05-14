import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { calendarForUser } from "@/lib/google";
import { studentVisibilityWhere, type Role } from "@/lib/access";

/**
 * Pulls events from Google Calendar (per-student calendars when set, plus
 * the user's primary), and upserts them into the local Event table for the
 * given time window.
 */
export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "unauth" }, { status: 401 });

  const url = new URL(req.url);
  const from = new Date(url.searchParams.get("from") ?? new Date());
  const to = new Date(url.searchParams.get("to") ?? new Date());
  const studentFilter = url.searchParams.get("student");

  const cal = await calendarForUser(session.user.id);
  if (!cal)
    return NextResponse.json(
      { error: "Google account not linked. Sign in with Google to sync." },
      { status: 400 },
    );

  const students = await prisma.student.findMany({
    where: {
      ...studentVisibilityWhere(session.user.id, session.user.role as Role),
      ...(studentFilter ? { id: studentFilter } : {}),
      calendarId: { not: null },
    },
    select: { id: true, calendarId: true },
  });

  // Always include 'primary' for the supervisor so 1:1s land somewhere
  const sources = [
    { calendarId: "primary", studentId: null as string | null },
    ...students.map((s) => ({ calendarId: s.calendarId!, studentId: s.id })),
  ];

  let imported = 0;
  for (const src of sources) {
    try {
      const r = await cal.events.list({
        calendarId: src.calendarId,
        timeMin: from.toISOString(),
        timeMax: to.toISOString(),
        singleEvents: true,
        orderBy: "startTime",
        maxResults: 250,
      });
      for (const item of r.data.items ?? []) {
        if (!item.id || !item.start || !item.end) continue;
        const startsAt = new Date(item.start.dateTime ?? item.start.date!);
        const endsAt = new Date(item.end.dateTime ?? item.end.date!);
        await prisma.event.upsert({
          where: { googleEventId: item.id },
          create: {
            googleEventId: item.id,
            googleCalendarId: src.calendarId,
            title: item.summary ?? "(no title)",
            description: item.description ?? null,
            location: item.location ?? null,
            meetingUrl: item.hangoutLink ?? null,
            startsAt,
            endsAt,
            allDay: !!item.start.date,
            ownerId: session.user.id,
            studentId: src.studentId,
          },
          update: {
            title: item.summary ?? "(no title)",
            description: item.description ?? null,
            location: item.location ?? null,
            meetingUrl: item.hangoutLink ?? null,
            startsAt,
            endsAt,
          },
        });
        imported++;
      }
    } catch (err) {
      console.error("Sync failed for", src.calendarId, err);
    }
  }

  return NextResponse.json({ ok: true, imported });
}
