import { NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";

const Body = z
  .object({
    email: z.string().email().optional(),
    userId: z.string().optional(),
    role: z.string().default("supervisor"),
  })
  .refine((d) => d.email || d.userId, {
    message: "email or userId required",
  });

async function loadOwned(id: string, userId: string, role: string) {
  if (role === "admin") {
    return prisma.student.findUnique({
      where: { id },
      select: { id: true, supervisorId: true },
    });
  }
  return prisma.student.findFirst({
    where: {
      id,
      OR: [
        { supervisorId: userId },
        { coSupervisors: { some: { userId } } },
      ],
    },
    select: { id: true, supervisorId: true },
  });
}

/** GET: list current additional supervisors + suggested users to add. */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "unauth" }, { status: 401 });
  const { id } = await params;
  if (session.user.role !== "admin" && session.user.role !== "supervisor")
    return NextResponse.json(
      { error: "Only supervisors can manage the team" },
      { status: 403 },
    );
  const student = await loadOwned(id, session.user.id, session.user.role);
  if (!student) return NextResponse.json({ error: "not found" }, { status: 404 });

  const [primary, current] = await Promise.all([
    prisma.user.findUnique({
      where: { id: student.supervisorId },
      select: { id: true, name: true, email: true, image: true, color: true, role: true },
    }),
    prisma.coSupervisor.findMany({
      where: { studentId: id },
      include: {
        user: { select: { id: true, name: true, email: true, image: true, color: true, role: true } },
      },
    }),
  ]);
  const excluded = new Set([student.supervisorId, ...current.map((c) => c.userId)]);
  const candidates = await prisma.user.findMany({
    where: {
      id: { notIn: Array.from(excluded) },
      role: { not: "student" },
    },
    select: { id: true, name: true, email: true, image: true, color: true, role: true },
    orderBy: [{ role: "asc" }, { name: "asc" }],
  });

  return NextResponse.json({ primary, current, candidates });
}

/** POST: add an additional supervisor by user id or email. */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "unauth" }, { status: 401 });
  if (session.user.role !== "admin" && session.user.role !== "supervisor")
    return NextResponse.json(
      { error: "Only supervisors can manage the team" },
      { status: 403 },
    );

  const { id } = await params;
  const student = await loadOwned(id, session.user.id, session.user.role);
  if (!student) return NextResponse.json({ error: "not found" }, { status: 404 });

  const json = await req.json().catch(() => null);
  const parsed = Body.safeParse(json);
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "bad input" }, { status: 400 });
  const d = parsed.data;

  const user = d.userId
    ? await prisma.user.findUnique({ where: { id: d.userId } })
    : await prisma.user.findUnique({ where: { email: d.email!.toLowerCase() } });
  if (!user)
    return NextResponse.json(
      {
        error:
          "No user with that email signed in yet. They need to sign in with Google at least once before you can add them.",
      },
      { status: 404 },
    );

  if (user.id === student.supervisorId)
    return NextResponse.json(
      { error: "That user is already a supervisor of this student." },
      { status: 409 },
    );

  if (user.role === "student")
    return NextResponse.json(
      { error: "Students cannot be added to a supervision team." },
      { status: 400 },
    );

  if (user.role === "team_advisor")
    return NextResponse.json(
      {
        error:
          "Team advisors follow every student globally — they aren't added per student.",
      },
      { status: 400 },
    );

  try {
    const created = await prisma.coSupervisor.create({
      data: { studentId: id, userId: user.id, role: d.role },
      include: {
        user: { select: { id: true, name: true, email: true, image: true, color: true, role: true } },
      },
    });
    // Best-effort: if the student already has a shared Google calendar, grant
    // the new team member writer access. Use the primary supervisor's token.
    try {
      const sup = student.supervisorId;
      if (sup) {
        const { syncCalendarAcl } = await import("@/lib/calendar-provisioning");
        await syncCalendarAcl(id, sup);
      }
    } catch {
      // ignore — sharing failure shouldn't block adding the team member
    }
    return NextResponse.json({ coSupervisor: created });
  } catch (err) {
    const e = err as { code?: string };
    if (e.code === "P2002")
      return NextResponse.json(
        { error: "Already a supervisor of this student." },
        { status: 409 },
      );
    throw err;
  }
}
