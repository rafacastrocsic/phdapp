import { NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import {
  teamLevelForStudent,
  canSeeSupervisorPrivate,
  type Role,
} from "@/lib/access";
import { currentWeekStart } from "@/lib/checkin";

const Body = z.object({
  did: z.string().nullable().optional(),
  blockers: z.string().nullable().optional(),
  next: z.string().nullable().optional(),
  wellbeing: z.number().int().min(1).max(5).nullable().optional(),
});

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "unauth" }, { status: 401 });
  const { id } = await params;
  const level = await teamLevelForStudent(id, session.user.id, session.user.role as Role);
  if (level === null) return NextResponse.json({ error: "not found" }, { status: 404 });

  const rows = await prisma.checkIn.findMany({
    where: { studentId: id },
    orderBy: { weekOf: "desc" },
  });
  // Wellbeing is supervisor-level only; the student sees their own.
  const showWellbeing = canSeeSupervisorPrivate(level) || level === "self";
  const checkins = rows.map((c) => ({
    id: c.id,
    weekOf: c.weekOf.toISOString(),
    did: c.did,
    blockers: c.blockers,
    next: c.next,
    wellbeing: showWellbeing ? c.wellbeing : null,
    updatedAt: c.updatedAt.toISOString(),
  }));
  return NextResponse.json({ checkins, canEdit: level === "self" });
}

// Upsert the CURRENT week's check-in. Student-only (they report on themselves).
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "unauth" }, { status: 401 });
  const { id } = await params;
  const level = await teamLevelForStudent(id, session.user.id, session.user.role as Role);
  if (level !== "self")
    return NextResponse.json(
      { error: "Only the student can submit their check-in" },
      { status: 403 },
    );

  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success)
    return NextResponse.json({ error: "bad input" }, { status: 400 });
  const d = parsed.data;
  const weekOf = currentWeekStart();

  const checkin = await prisma.checkIn.upsert({
    where: { studentId_weekOf: { studentId: id, weekOf } },
    create: {
      studentId: id,
      weekOf,
      did: d.did ?? null,
      blockers: d.blockers ?? null,
      next: d.next ?? null,
      wellbeing: d.wellbeing ?? null,
    },
    update: {
      did: d.did ?? null,
      blockers: d.blockers ?? null,
      next: d.next ?? null,
      wellbeing: d.wellbeing ?? null,
    },
  });
  return NextResponse.json({
    checkin: {
      id: checkin.id,
      weekOf: checkin.weekOf.toISOString(),
      did: checkin.did,
      blockers: checkin.blockers,
      next: checkin.next,
      wellbeing: checkin.wellbeing,
      updatedAt: checkin.updatedAt.toISOString(),
    },
  });
}
