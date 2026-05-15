import { NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import {
  teamLevelForStudent,
  canSeeSupervisorPrivate,
  isAdmin,
  type Role,
} from "@/lib/access";

const Patch = z.object({ body: z.string().min(1) });

// Non-supervisors must never learn this exists → 404, not 403.
async function gate(studentId: string, userId: string, role: Role) {
  const level = await teamLevelForStudent(studentId, userId, role);
  return canSeeSupervisorPrivate(level);
}

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string; noteId: string }> },
) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "unauth" }, { status: 401 });
  const { id, noteId } = await params;
  if (!(await gate(id, session.user.id, session.user.role as Role)))
    return NextResponse.json({ error: "not found" }, { status: 404 });

  const note = await prisma.supervisorNote.findFirst({
    where: { id: noteId, studentId: id },
    select: { id: true, authorId: true },
  });
  if (!note) return NextResponse.json({ error: "not found" }, { status: 404 });
  // Only the author (or admin) can edit a note.
  if (note.authorId !== session.user.id && !isAdmin(session.user.role))
    return NextResponse.json(
      { error: "Only the note's author can edit it" },
      { status: 403 },
    );

  const parsed = Patch.safeParse(await req.json().catch(() => null));
  if (!parsed.success)
    return NextResponse.json({ error: "bad input" }, { status: 400 });

  const updated = await prisma.supervisorNote.update({
    where: { id: noteId },
    data: { body: parsed.data.body },
    include: {
      author: { select: { id: true, name: true, image: true, color: true } },
    },
  });
  return NextResponse.json({ note: updated });
}

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string; noteId: string }> },
) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "unauth" }, { status: 401 });
  const { id, noteId } = await params;
  if (!(await gate(id, session.user.id, session.user.role as Role)))
    return NextResponse.json({ error: "not found" }, { status: 404 });

  const note = await prisma.supervisorNote.findFirst({
    where: { id: noteId, studentId: id },
    select: { id: true, authorId: true },
  });
  if (!note) return NextResponse.json({ error: "not found" }, { status: 404 });
  if (note.authorId !== session.user.id && !isAdmin(session.user.role))
    return NextResponse.json(
      { error: "Only the note's author can delete it" },
      { status: 403 },
    );

  await prisma.supervisorNote.delete({ where: { id: noteId } });
  return NextResponse.json({ ok: true });
}
