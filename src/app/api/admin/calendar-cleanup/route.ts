import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { isAdmin, type Role } from "@/lib/access";
import { calendarForUser } from "@/lib/google";
import { syncTaskDueEvent } from "@/lib/task-event-sync";

// Admin-only one-shot cleanup for legacy calendar disparities.
//
// Two kinds of disparity exist:
//
//   (A) Old-sync-bug duplicates.
//       The pre-fix sync route imported Google events as new DB rows
//       (singleEvents:true returned per-occurrence synthetic ids, so
//       the upsert didn't match the existing task-mirror row). Result:
//       two Event rows for the same task — one with ticketId set
//       (the canonical task mirror), one with ticketId=null (the
//       orphan that drifted in via sync). Each gets pushed to Google
//       on the next save, so duplicates appear on both sides.
//
//   (B) OAuth-failure orphans.
//       Tasks whose Event row has googleEventId=null but whose task
//       has a dueDate. These were created while the user's Google
//       refresh token was revoked: the local row was saved, the
//       Google push failed silently. Now Google has no copy.
//
// Both are fixed here:
//   - For (A): delete the ticketId=null twin (DB + Google) when there's
//     a canonical task-mirror with the same title + same calendar-day.
//     The task-mirror stays as the source of truth.
//   - For (B): re-run syncTaskDueEvent for any task whose linked Event
//     has googleEventId=null. This pushes to Google now that the
//     refresh token is fresh.
//
// Pass ?dryRun=1 to get a plan without making any changes.
//
// Restricted to admin role.
export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user)
    return NextResponse.json({ error: "unauth" }, { status: 401 });
  if (!isAdmin(session.user.role as Role))
    return NextResponse.json({ error: "forbidden" }, { status: 403 });

  const url = new URL(req.url);
  const dryRun = url.searchParams.get("dryRun") === "1";

  const report: {
    dryRun: boolean;
    duplicates: Array<{
      title: string;
      day: string;
      keeperId: string;
      orphanId: string;
      orphanGoogleEventId: string | null;
      orphanGoogleCalendarId: string | null;
      action: "would-delete" | "deleted-db" | "deleted-db+google" | "kept-google-error";
    }>;
    danglingPrefixed: Array<{
      title: string;
      day: string;
      eventId: string;
      googleEventId: string | null;
      googleCalendarId: string | null;
      action: "would-delete" | "deleted-db" | "deleted-db+google" | "kept-google-error";
    }>;
    orphans: Array<{
      taskId: string;
      taskTitle: string;
      eventId: string;
      action: "would-resync" | "resynced" | "resync-failed";
      error?: string;
    }>;
  } = { dryRun, duplicates: [], danglingPrefixed: [], orphans: [] };

  // ─── (A) Old-sync-bug duplicates ────────────────────────────────────
  // Pull all rows that look like task mirrors (title starts with
  // "[Task]_") plus any sibling rows with the same title on the same
  // calendar day. Index by (title, YYYY-MM-DD).
  const candidates = await prisma.event.findMany({
    where: {
      OR: [
        { title: { startsWith: "[Task]_" } },
        // Anything that has a ticketId is a canonical task mirror.
        { ticketId: { not: null } },
      ],
    },
    select: {
      id: true,
      title: true,
      startsAt: true,
      ticketId: true,
      googleEventId: true,
      googleCalendarId: true,
    },
    orderBy: { startsAt: "asc" },
  });

  // Group by title + day (YYYY-MM-DD in UTC — task mirrors use noon
  // UTC anchors, so the date portion is stable).
  const groups = new Map<string, typeof candidates>();
  for (const e of candidates) {
    const key = `${e.title}|${e.startsAt.toISOString().slice(0, 10)}`;
    const arr = groups.get(key) ?? [];
    arr.push(e);
    groups.set(key, arr);
  }

  for (const [key, rows] of groups) {
    if (rows.length < 2) continue;
    // Keep the one with ticketId (canonical task mirror). If multiple
    // have ticketId, keep the oldest. If none have ticketId, skip —
    // we can't tell which is canonical.
    const withTicket = rows.filter((r) => r.ticketId);
    if (withTicket.length === 0) continue;
    const keeper = withTicket[0];
    const orphans = rows.filter((r) => r.id !== keeper.id);
    for (const orphan of orphans) {
      const day = orphan.startsAt.toISOString().slice(0, 10);
      const entry: (typeof report.duplicates)[number] = {
        title: orphan.title,
        day,
        keeperId: keeper.id,
        orphanId: orphan.id,
        orphanGoogleEventId: orphan.googleEventId,
        orphanGoogleCalendarId: orphan.googleCalendarId,
        action: "would-delete",
      };
      if (!dryRun) {
        // Delete from Google first (best-effort), then DB.
        let googleOk = true;
        if (orphan.googleEventId && orphan.googleCalendarId) {
          const cal = await calendarForUser(session.user.id);
          if (cal) {
            try {
              await cal.events.delete({
                calendarId: orphan.googleCalendarId,
                eventId: orphan.googleEventId,
                sendUpdates: "none",
              });
            } catch (err) {
              googleOk = false;
              console.error("cleanup: Google delete failed", err);
            }
          }
        }
        await prisma.event.delete({ where: { id: orphan.id } }).catch(() => {});
        entry.action = googleOk
          ? orphan.googleEventId
            ? "deleted-db+google"
            : "deleted-db"
          : "kept-google-error";
      }
      report.duplicates.push(entry);
    }
    void key;
  }

  // ─── (A.2) Dangling prefixed events ─────────────────────────────────
  // Any Event whose title starts with "[Task]_" or "[Sub-task]_" but
  // which is NOT linked to a current Ticket/sub-task. Two ways this
  // happens:
  //   - Old-sync-bug imported the row with ticketId=null. Its task-
  //     mirror twin has since been deleted (e.g. user cleared the
  //     due date), leaving the orphan with no twin to pair against.
  //   - A task was deleted (or its dueDate cleared) but the OLD sync
  //     copy had drifted to a separate row and wasn't cleaned up.
  //
  // Genuine user-created events that happen to use these prefixes are
  // not a real concern — the prefixes are reserved markers added by
  // syncTaskDueEvent and syncSubtaskDueEvents.
  const danglingTasks = await prisma.event.findMany({
    where: {
      title: { startsWith: "[Task]_" },
      ticketId: null,
    },
    select: {
      id: true,
      title: true,
      startsAt: true,
      googleEventId: true,
      googleCalendarId: true,
    },
  });
  const danglingSubtasks = await prisma.event.findMany({
    where: {
      title: { startsWith: "[Sub-task]_" },
      subtaskParentId: null,
    },
    select: {
      id: true,
      title: true,
      startsAt: true,
      googleEventId: true,
      googleCalendarId: true,
    },
  });
  for (const e of [...danglingTasks, ...danglingSubtasks]) {
    // Skip if this row is already in `duplicates` (we'd be double-
    // counting it). Match by orphanId.
    if (report.duplicates.some((d) => d.orphanId === e.id)) continue;
    const entry: (typeof report.danglingPrefixed)[number] = {
      title: e.title,
      day: e.startsAt.toISOString().slice(0, 10),
      eventId: e.id,
      googleEventId: e.googleEventId,
      googleCalendarId: e.googleCalendarId,
      action: "would-delete",
    };
    if (!dryRun) {
      let googleOk = true;
      if (e.googleEventId && e.googleCalendarId) {
        const cal = await calendarForUser(session.user.id);
        if (cal) {
          try {
            await cal.events.delete({
              calendarId: e.googleCalendarId,
              eventId: e.googleEventId,
              sendUpdates: "none",
            });
          } catch (err) {
            googleOk = false;
            console.error("cleanup: Google delete (dangling) failed", err);
          }
        }
      }
      await prisma.event.delete({ where: { id: e.id } }).catch(() => {});
      entry.action = googleOk
        ? e.googleEventId
          ? "deleted-db+google"
          : "deleted-db"
        : "kept-google-error";
    }
    report.danglingPrefixed.push(entry);
  }

  // ─── (B) OAuth-failure orphans ──────────────────────────────────────
  // Any task with a due date whose linked Event has googleEventId=null.
  // Re-run syncTaskDueEvent to push it now.
  const tasksMissingGoogle = await prisma.ticket.findMany({
    where: {
      dueDate: { not: null },
      dueEvent: { googleEventId: null },
    },
    select: {
      id: true,
      title: true,
      dueEvent: { select: { id: true } },
    },
  });

  for (const t of tasksMissingGoogle) {
    if (!t.dueEvent) continue;
    const entry: (typeof report.orphans)[number] = {
      taskId: t.id,
      taskTitle: t.title,
      eventId: t.dueEvent.id,
      action: "would-resync",
    };
    if (!dryRun) {
      try {
        await syncTaskDueEvent(t.id, session.user.id);
        // Re-read to confirm
        const after = await prisma.event.findUnique({
          where: { id: t.dueEvent.id },
          select: { googleEventId: true },
        });
        entry.action = after?.googleEventId ? "resynced" : "resync-failed";
        if (!after?.googleEventId)
          entry.error = "syncTaskDueEvent did not set googleEventId";
      } catch (err) {
        entry.action = "resync-failed";
        entry.error = (err as Error).message;
      }
    }
    report.orphans.push(entry);
  }

  return NextResponse.json(report);
}
