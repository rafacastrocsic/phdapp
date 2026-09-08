import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { isAdmin, type Role } from "@/lib/access";

/**
 * Admin-only cleanup for events wrongly imported from a user's PERSONAL
 * Google calendar by the old "Sync Google" behaviour (which included the
 * user's `primary` calendar). Those rows are unassigned AND not general
 * (studentId = null, isGeneral = false) — the app never creates that shape,
 * so they show up under "All" but belong to no calendar filter — and they
 * carry a googleEventId (they were imported from Google).
 *
 * IMPORTANT: this deletes only the PhDapp DB rows. It does NOT call Google —
 * those googleEventIds point at the person's real personal-calendar events,
 * which must stay untouched in their own Google Calendar.
 *
 * Pass ?dryRun=1 to preview the count and a few sample titles without
 * deleting anything.
 */
const WHERE = {
  studentId: null,
  isGeneral: false,
  googleEventId: { not: null },
} as const;

export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user)
    return NextResponse.json({ error: "unauth" }, { status: 401 });
  if (!isAdmin(session.user.role as Role))
    return NextResponse.json({ error: "forbidden" }, { status: 403 });

  const dryRun = new URL(req.url).searchParams.get("dryRun") === "1";

  const matches = await prisma.event.findMany({
    where: WHERE,
    select: {
      id: true,
      title: true,
      startsAt: true,
      googleCalendarId: true,
      owner: { select: { name: true, email: true } },
    },
    orderBy: { startsAt: "asc" },
  });

  const samples = matches.slice(0, 12).map((e) => ({
    title: e.title,
    day: e.startsAt.toISOString().slice(0, 10),
    owner: e.owner?.name ?? e.owner?.email ?? "unknown",
    calendar: e.googleCalendarId,
  }));

  if (dryRun)
    return NextResponse.json({ dryRun: true, count: matches.length, samples });

  const del = await prisma.event.deleteMany({ where: WHERE });
  return NextResponse.json({ dryRun: false, count: del.count, samples });
}
