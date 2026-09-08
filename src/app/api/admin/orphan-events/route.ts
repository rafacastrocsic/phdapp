import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { isAdmin, type Role } from "@/lib/access";

/**
 * Admin diagnostic + cleanup for "home-less" calendar events: rows with
 * studentId = null AND isGeneral = false. The app no longer creates that
 * shape, so these show only under the "All" filter and belong to no student,
 * General or researcher calendar. They come from:
 *   - the old "Sync Google" behaviour that imported a personal `primary`
 *     calendar (often recurring / all-day blocks), and/or
 *   - legacy "team-only" events from before that visibility was retired,
 *   - due-date mirrors of a General/team TASK (ticketId / subtaskParentId
 *     set) — those aren't junk, they just need re-homing to General.
 *
 * Query:
 *   (no fix)      → read-only report: counts + a detailed list so you can
 *                   see exactly what these are before changing anything.
 *   ?fix=rehome   → set isGeneral=true on the TASK/sub-task deadline rows so
 *                   they show under "General only" instead of being orphans.
 *   ?fix=delete   → delete the NON-task home-less rows (plain events + the
 *                   imported personal / recurring blocks). PhDapp rows ONLY —
 *                   never Google, so any real personal-calendar originals stay
 *                   intact.
 */
const ORPHAN = { studentId: null, isGeneral: false } as const;
const TASKY = {
  OR: [{ ticketId: { not: null } }, { subtaskParentId: { not: null } }],
};
const NON_TASKY = { ticketId: null, subtaskParentId: null } as const;

export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user)
    return NextResponse.json({ error: "unauth" }, { status: 401 });
  if (!isAdmin(session.user.role as Role))
    return NextResponse.json({ error: "forbidden" }, { status: 403 });

  const fix = new URL(req.url).searchParams.get("fix"); // null | "rehome" | "delete"

  if (fix === "rehome") {
    const r = await prisma.event.updateMany({
      where: { ...ORPHAN, ...TASKY },
      data: { isGeneral: true },
    });
    return NextResponse.json({ fix, rehomed: r.count });
  }
  if (fix === "delete") {
    const r = await prisma.event.deleteMany({
      where: { ...ORPHAN, ...NON_TASKY },
    });
    return NextResponse.json({ fix, deleted: r.count });
  }

  // Read-only report.
  const rows = await prisma.event.findMany({
    where: ORPHAN,
    select: {
      id: true,
      title: true,
      startsAt: true,
      allDay: true,
      recurrenceRule: true,
      googleEventId: true,
      googleCalendarId: true,
      ticketId: true,
      subtaskParentId: true,
      createdAt: true,
      owner: { select: { name: true, email: true } },
    },
    orderBy: { startsAt: "asc" },
  });

  const view = rows.map((e) => ({
    title: e.title,
    day: e.startsAt.toISOString().slice(0, 10),
    owner: e.owner?.name ?? e.owner?.email ?? "unknown",
    recurring: !!e.recurrenceRule,
    allDay: e.allDay,
    fromGoogle: !!e.googleEventId,
    calendar: e.googleCalendarId,
    type: e.ticketId ? "task" : e.subtaskParentId ? "subtask" : "event",
  }));

  const taskLike = view.filter((v) => v.type !== "event");
  const nonTask = view.filter((v) => v.type === "event");
  const owners = Array.from(new Set(view.map((v) => v.owner)));

  return NextResponse.json({
    total: rows.length,
    rehomeableTaskDeadlines: taskLike.length, // fixed by ?fix=rehome
    deletableEvents: nonTask.length, // removed by ?fix=delete
    owners,
    // Full detail so the admin can see precisely what these are.
    items: view,
  });
}
