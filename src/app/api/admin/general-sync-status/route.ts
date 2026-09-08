import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { isAdmin, type Role } from "@/lib/access";
import { calendarForUser } from "@/lib/google";
import { getGeneralCalendarId } from "@/lib/general-calendar";

/**
 * Admin diagnostic (+ optional backfill) for General events and whether they
 * reached the shared General Google calendar.
 *
 * A General event (studentId=null, isGeneral=true) is pushed to the admin-
 * configured General calendar when created — BUT only if the creator has
 * write access to it. If they don't, the create route falls back to the
 * creator's OWN primary calendar (so the event is on Google, just not on the
 * shared General calendar). Events created with "Also push to Google" off, or
 * while Google was unlinked, were never pushed at all.
 *
 * Classification per event:
 *   - onGeneral  : googleCalendarId === the configured General calendar id
 *   - elsewhere  : has a googleEventId but on another calendar (usually a
 *                  creator's "primary" — the no-write-access fallback)
 *   - notPushed  : googleEventId is null (never reached Google)
 *
 * ?fix=push (admin only): re-push the notPushed ones onto the General
 * calendar using the admin's token (safe: they have no Google copy, so no
 * duplicates). "elsewhere" events are left alone — their copy lives on a
 * person's own calendar and re-pushing would duplicate.
 */
const GENERAL = { studentId: null, isGeneral: true } as const;

export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user)
    return NextResponse.json({ error: "unauth" }, { status: 401 });
  if (!isAdmin(session.user.role as Role))
    return NextResponse.json({ error: "forbidden" }, { status: 403 });

  const fix = new URL(req.url).searchParams.get("fix"); // null | "push"
  const generalId = await getGeneralCalendarId();

  const rows = await prisma.event.findMany({
    where: GENERAL,
    select: {
      id: true,
      title: true,
      startsAt: true,
      endsAt: true,
      googleEventId: true,
      googleCalendarId: true,
      description: true,
      location: true,
      recurrenceRule: true,
      ownerId: true,
      owner: { select: { name: true, email: true } },
    },
    orderBy: { startsAt: "asc" },
  });

  const classify = (e: (typeof rows)[number]) =>
    !e.googleEventId
      ? "notPushed"
      : generalId && e.googleCalendarId === generalId
        ? "onGeneral"
        : "elsewhere";

  if (fix === "push") {
    if (!generalId)
      return NextResponse.json(
        {
          error:
            "No General calendar is configured (Admin → General calendar), so there's nowhere to push to.",
        },
        { status: 400 },
      );
    const cal = await calendarForUser(session.user.id);
    if (!cal)
      return NextResponse.json(
        { error: "Your Google account isn't linked." },
        { status: 400 },
      );
    let pushed = 0;
    const failed: { title: string; error: string }[] = [];
    for (const e of rows) {
      if (e.googleEventId) continue; // only backfill never-pushed ones
      try {
        const r = await cal.events.insert({
          calendarId: generalId,
          requestBody: {
            summary: e.title,
            description: e.description ?? undefined,
            location: e.location ?? undefined,
            start: { dateTime: e.startsAt.toISOString(), timeZone: "UTC" },
            end: { dateTime: e.endsAt.toISOString(), timeZone: "UTC" },
            recurrence: e.recurrenceRule
              ? [`RRULE:${e.recurrenceRule}`]
              : undefined,
          },
        });
        await prisma.event.update({
          where: { id: e.id },
          data: { googleEventId: r.data.id ?? null, googleCalendarId: generalId },
        });
        pushed++;
      } catch (err) {
        failed.push({ title: e.title, error: (err as Error).message ?? "unknown" });
      }
    }
    return NextResponse.json({ fix, pushed, failed });
  }

  if (fix === "rehome") {
    // Move "elsewhere" General events (their Google copy lives on a creator's
    // personal calendar) onto the shared General calendar: create a fresh copy
    // there with the admin's token, delete the old copy with the OWNER's token
    // (only they can touch their personal calendar), and repoint the DB row.
    if (!generalId)
      return NextResponse.json(
        {
          error:
            "No General calendar is configured (Admin → General calendar), so there's nowhere to move them to.",
        },
        { status: 400 },
      );
    const adminCal = await calendarForUser(session.user.id);
    if (!adminCal)
      return NextResponse.json(
        { error: "Your Google account isn't linked." },
        { status: 400 },
      );
    let moved = 0;
    const failed: { title: string; error: string }[] = [];
    for (const e of rows) {
      if (classify(e) !== "elsewhere") continue;
      try {
        const r = await adminCal.events.insert({
          calendarId: generalId,
          requestBody: {
            summary: e.title,
            description: e.description ?? undefined,
            location: e.location ?? undefined,
            start: { dateTime: e.startsAt.toISOString(), timeZone: "UTC" },
            end: { dateTime: e.endsAt.toISOString(), timeZone: "UTC" },
            recurrence: e.recurrenceRule
              ? [`RRULE:${e.recurrenceRule}`]
              : undefined,
          },
        });
        // Best-effort: remove the stray copy from the owner's own calendar.
        if (e.googleEventId && e.googleCalendarId) {
          const ownerCal = await calendarForUser(e.ownerId);
          if (ownerCal) {
            await ownerCal.events
              .delete({ calendarId: e.googleCalendarId, eventId: e.googleEventId })
              .catch(() => {});
          }
        }
        await prisma.event.update({
          where: { id: e.id },
          data: { googleEventId: r.data.id ?? null, googleCalendarId: generalId },
        });
        moved++;
      } catch (err) {
        failed.push({ title: e.title, error: (err as Error).message ?? "unknown" });
      }
    }
    return NextResponse.json({ fix, moved, failed });
  }

  // Read-only report.
  const items = rows.map((e) => ({
    title: e.title,
    day: e.startsAt.toISOString().slice(0, 10),
    owner: e.owner?.name ?? e.owner?.email ?? "unknown",
    status: classify(e),
    calendar: e.googleCalendarId,
  }));
  return NextResponse.json({
    generalCalendarConfigured: !!generalId,
    generalCalendarId: generalId,
    total: items.length,
    onGeneral: items.filter((i) => i.status === "onGeneral").length,
    elsewhere: items.filter((i) => i.status === "elsewhere").length,
    notPushed: items.filter((i) => i.status === "notPushed").length,
    items,
  });
}
