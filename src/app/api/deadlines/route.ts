import { NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { studentVisibilityWhereAllForAdmin, type Role } from "@/lib/access";
import { isSeniorTeam } from "@/lib/discussions-access";

// Calls & deadlines. Readable by EVERYONE (students included — fellowship
// calls matter to them); only the senior team may create or edit.

const Body = z.object({
  title: z.string().min(1).max(300),
  kind: z.enum(["call", "report", "internal"]).default("call"),
  opensAt: z.string().nullable().optional(),
  closesAt: z.string(),
  url: z.string().nullable().optional(),
  notes: z.string().max(5000).nullable().optional(),
  driveFolderUrl: z.string().nullable().optional(),
  studentId: z.string().nullable().optional(),
});

export async function GET() {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "unauth" }, { status: 401 });
  const rows = await prisma.deadline.findMany({
    orderBy: { closesAt: "asc" },
    include: { student: { select: { id: true, fullName: true, alias: true, color: true } } },
  });
  return NextResponse.json({ items: rows });
}

export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "unauth" }, { status: 401 });
  const role = session.user.role as Role;
  if (!(await isSeniorTeam(session.user.id, role)))
    return NextResponse.json(
      { error: "Only the supervising team can add calls and deadlines." },
      { status: 403 },
    );

  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success)
    return NextResponse.json({ error: "bad input" }, { status: 400 });
  const d = parsed.data;

  const closesAt = new Date(d.closesAt);
  const opensAt = d.opensAt ? new Date(d.opensAt) : null;
  if (isNaN(closesAt.getTime()) || (opensAt && isNaN(opensAt.getTime())))
    return NextResponse.json({ error: "bad date" }, { status: 400 });
  if (opensAt && opensAt > closesAt)
    return NextResponse.json(
      { error: "The opening date must be before the closing date." },
      { status: 400 },
    );

  // A tagged student must be one this user can see.
  let studentId: string | null = null;
  if (d.studentId) {
    const visible = await prisma.student.findFirst({
      where: { id: d.studentId, ...studentVisibilityWhereAllForAdmin(session.user.id, role) },
      select: { id: true },
    });
    if (!visible)
      return NextResponse.json({ error: "That student isn't visible to you." }, { status: 400 });
    studentId = visible.id;
  }

  const item = await prisma.deadline.create({
    data: {
      title: d.title.trim(),
      kind: d.kind,
      opensAt,
      closesAt,
      url: d.url?.trim() || null,
      notes: d.notes?.trim() || null,
      driveFolderUrl: d.driveFolderUrl?.trim() || null,
      studentId,
      createdById: session.user.id,
    },
    select: { id: true },
  });
  return NextResponse.json({ ok: true, id: item.id });
}
