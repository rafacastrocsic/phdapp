import { NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { teamLevelForStudent, type Role } from "@/lib/access";

const Patch = z.object({
  title: z.string().min(1).optional(),
  status: z.string().optional(),
  order: z.number().int().optional(),
  driveUrl: z.string().nullable().optional(),
  notes: z.string().nullable().optional(),
});

async function canWrite(studentId: string, userId: string, role: Role) {
  const level = await teamLevelForStudent(studentId, userId, role);
  return level === "supervisor" || level === "self";
}

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string; chapterId: string }> },
) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "unauth" }, { status: 401 });
  const { id, chapterId } = await params;
  if (!(await canWrite(id, session.user.id, session.user.role as Role)))
    return NextResponse.json({ error: "forbidden" }, { status: 403 });

  const parsed = Patch.safeParse(await req.json().catch(() => null));
  if (!parsed.success)
    return NextResponse.json({ error: "bad input" }, { status: 400 });

  const existing = await prisma.thesisChapter.findFirst({
    where: { id: chapterId, studentId: id },
    select: { id: true },
  });
  if (!existing) return NextResponse.json({ error: "not found" }, { status: 404 });

  const chapter = await prisma.thesisChapter.update({
    where: { id: chapterId },
    data: parsed.data,
  });
  return NextResponse.json({ chapter });
}

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string; chapterId: string }> },
) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "unauth" }, { status: 401 });
  const { id, chapterId } = await params;
  if (!(await canWrite(id, session.user.id, session.user.role as Role)))
    return NextResponse.json({ error: "forbidden" }, { status: 403 });

  const existing = await prisma.thesisChapter.findFirst({
    where: { id: chapterId, studentId: id },
    select: { id: true },
  });
  if (!existing) return NextResponse.json({ error: "not found" }, { status: 404 });

  await prisma.thesisChapter.delete({ where: { id: chapterId } });
  return NextResponse.json({ ok: true });
}
