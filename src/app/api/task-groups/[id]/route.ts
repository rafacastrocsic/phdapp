import { NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { accessForStudent, canWriteForStudent, type Role } from "@/lib/access";

const Patch = z.object({ name: z.string().min(1).max(120) });

async function gate(groupId: string, userId: string, role: Role) {
  const g = await prisma.taskGroup.findUnique({
    where: { id: groupId },
    select: { id: true, studentId: true },
  });
  if (!g) return null;
  const access = await accessForStudent(g.studentId, userId, role);
  return canWriteForStudent(access) ? g : null;
}

// Rename a group.
export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "unauth" }, { status: 401 });
  const { id } = await params;
  const g = await gate(id, session.user.id, session.user.role as Role);
  if (!g) return NextResponse.json({ error: "not found" }, { status: 404 });

  const parsed = Patch.safeParse(await req.json().catch(() => null));
  if (!parsed.success)
    return NextResponse.json({ error: "bad input" }, { status: 400 });

  await prisma.taskGroup.update({
    where: { id },
    data: { name: parsed.data.name.trim() },
  });
  return NextResponse.json({ ok: true });
}

// Disband a group: detach its tasks (groupId → null), then delete the group.
export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "unauth" }, { status: 401 });
  const { id } = await params;
  const g = await gate(id, session.user.id, session.user.role as Role);
  if (!g) return NextResponse.json({ error: "not found" }, { status: 404 });

  await prisma.ticket.updateMany({
    where: { groupId: id },
    data: { groupId: null },
  });
  await prisma.taskGroup.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}
