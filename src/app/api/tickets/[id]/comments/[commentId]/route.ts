import { NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import {
  studentVisibilityWhereAllForAdmin,
  accessForStudent,
  canWriteForStudent,
  type Role,
} from "@/lib/access";

const Body = z.object({ body: z.string().min(1) });

async function loadComment(
  ticketId: string,
  commentId: string,
  userId: string,
  role: Role,
) {
  const ticket = await prisma.ticket.findFirst({
    where: {
      id: ticketId,
      student: studentVisibilityWhereAllForAdmin(userId, role),
    },
    select: { id: true, studentId: true },
  });
  if (!ticket) return null;
  const comment = await prisma.comment.findFirst({
    where: { id: commentId, ticketId },
    select: { id: true, authorId: true },
  });
  if (!comment) return null;
  return { ticket, comment };
}

// Edit a comment — author only. Marks it as edited.
export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string; commentId: string }> },
) {
  const session = await auth();
  if (!session?.user)
    return NextResponse.json({ error: "unauth" }, { status: 401 });
  const { id, commentId } = await params;
  const ctx = await loadComment(
    id,
    commentId,
    session.user.id,
    session.user.role as Role,
  );
  if (!ctx) return NextResponse.json({ error: "not found" }, { status: 404 });

  if (ctx.comment.authorId !== session.user.id)
    return NextResponse.json(
      { error: "You can only edit your own comments" },
      { status: 403 },
    );

  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success)
    return NextResponse.json({ error: "bad input" }, { status: 400 });

  const c = await prisma.comment.update({
    where: { id: commentId },
    data: { body: parsed.data.body, editedAt: new Date() },
    include: { author: { select: { name: true, image: true, color: true } } },
  });
  return NextResponse.json({
    comment: {
      id: c.id,
      body: c.body,
      author: c.author,
      createdAt: c.createdAt.toISOString(),
      editedAt: c.editedAt?.toISOString() ?? null,
      mine: true,
    },
  });
}

// Delete a comment — its author, or a supervisor/admin who can write the
// student (moderation).
export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string; commentId: string }> },
) {
  const session = await auth();
  if (!session?.user)
    return NextResponse.json({ error: "unauth" }, { status: 401 });
  const { id, commentId } = await params;
  const ctx = await loadComment(
    id,
    commentId,
    session.user.id,
    session.user.role as Role,
  );
  if (!ctx) return NextResponse.json({ error: "not found" }, { status: 404 });

  const isAuthor = ctx.comment.authorId === session.user.id;
  let canModerate = false;
  if (!isAuthor) {
    const access = await accessForStudent(
      ctx.ticket.studentId,
      session.user.id,
      session.user.role as Role,
    );
    canModerate = canWriteForStudent(access);
  }
  if (!isAuthor && !canModerate)
    return NextResponse.json(
      { error: "You can't delete this comment" },
      { status: 403 },
    );

  await prisma.comment.delete({ where: { id: commentId } });
  return NextResponse.json({ ok: true });
}
