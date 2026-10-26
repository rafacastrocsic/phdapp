import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { calendarForUser } from "@/lib/google";
import { studentVisibilityWhere, type Role } from "@/lib/access";

/**
 * Pulls events from Google Calendar into the local Event table for the given
 * time window. ONLY the shared per-student calendars are synced — never the
 * user's own `primary` calendar. Importing `primary` pulled a supervisor's
 * private personal events into PhDapp as team-wide events, which is never
 * wanted; the app is the source of truth for its own events and pushes them
 * OUT to Google, it doesn't pull a personal calendar IN.
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

  // Only the shared per-student calendars — NEVER the user's own 'primary'
  // calendar (that pulled supervisors' private personal events into PhDapp
  // as home-less team-wide events).
  const sources = students.map((s) => ({
    calendarId: s.calendarId!,
    studentId: s.id as string | null,
  }));

  let imported = 0;
  for (const src of sources) {
    try {
      // singleEvents:false → Google returns the *master* recurring
      // event (with its `recurrence` field), not the per-day expanded
      // instances. PhDapp stores the master and expands client-side
      // via expandOccurrences, so importing instances would duplicate
      // the same day on the calendar (one from the local master, one
      // for every Google-expanded instance). Matching IDs on the
      // master keeps the upsert idempotent.
      const r = await cal.events.list({
        calendarId: src.calendarId,
        timeMin: from.toISOString(),
        timeMax: to.toISOString(),
        singleEvents: false,
        // Cancelled instances are how Google represents a skipped occurrence,
        // so they must come through or we'd never learn about one.
        showDeleted: true,
        maxResults: 250,
      });
      for (const item of r.data.items ?? []) {
        if (!item.id || !item.start || !item.end) continue;
        // A per-instance override of a recurring series (recurringEventId
        // set = this is NOT the master). Import it as an exception against
        // our copy of the series, so a meeting someone moved or skipped in
        // Google shows the same way here.
        if (item.recurringEventId) {
          const master = await prisma.event.findUnique({
            where: { googleEventId: item.recurringEventId },
            select: { id: true },
          });
          if (!master) continue;
          const ostRaw =
            item.originalStartTime?.dateTime ?? item.originalStartTime?.date;
          if (!ostRaw) continue;
          const originalStart = new Date(ostRaw);
          if (isNaN(originalStart.getTime())) continue;
          const cancelled = item.status === "cancelled";
          const stRaw = item.start?.dateTime ?? item.start?.date ?? null;
          const enRaw = item.end?.dateTime ?? item.end?.date ?? null;
          const movedStart = !cancelled && stRaw ? new Date(stRaw) : null;
          const movedEnd = !cancelled && enRaw ? new Date(enRaw) : null;
          await prisma.eventOccurrence.upsert({
            where: {
              eventId_originalStart: { eventId: master.id, originalStart },
            },
            create: {
              eventId: master.id,
              originalStart,
              cancelled,
              startsAt: movedStart,
              endsAt: movedEnd,
              googleEventId: item.id ?? null,
            },
            update: {
              cancelled,
              startsAt: movedStart,
              endsAt: movedEnd,
              googleEventId: item.id ?? null,
            },
          });
          imported++;
          continue;
        }
        // A cancelled MASTER isn't something we mirror — skip it.
        if (item.status === "cancelled") continue;
        const startsAt = new Date(item.start.dateTime ?? item.start.date!);
        const endsAt = new Date(item.end.dateTime ?? item.end.date!);
        // Extract the RRULE body (e.g. "FREQ=WEEKLY;INTERVAL=1") from
        // Google's `recurrence` array (entries look like "RRULE:…").
        // Ignore EXRULE / RDATE / EXDATE — the MVP only stores RRULE.
        const rruleLine = (item.recurrence ?? []).find((s) =>
          s.startsWith("RRULE:"),
        );
        const recurrenceRule = rruleLine ? rruleLine.replace(/^RRULE:/, "") : null;
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
            recurrenceRule,
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
            recurrenceRule,
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
