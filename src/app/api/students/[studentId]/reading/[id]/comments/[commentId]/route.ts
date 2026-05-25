import { NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import {
  accessForStudent,
  canWriteForStudent,
  studentVisibilityWhereAllForAdmin,
  isAdmin,
  type Role,
} from "@/lib/access";

const Body = z.object({ body: z.string().min(1) });

async function loadReadingComment(
  studentId: string,
  readingItemId: string,
  commentId: string,
  userId: string,
  role: Role,
) {
  if (!isAdmin(role)) {
    const visible = await prisma.student.findFirst({
      where: {
        id: studentId,
        ...studentVisibilityWhereAllForAdmin(userId, role),
      },
      select: { id: true },
    });
    if (!visible) return null;
  }
  const item = await prisma.readingItem.findFirst({
    where: { id: readingItemId, studentId },
    select: { id: true, studentId: true },
  });
  if (!item) return null;
  const comment = await prisma.comment.findFirst({
    where: { id: commentId, readingItemId },
    select: { id: true, authorId: true },
  });
  if (!comment) return null;
  return { item, comment };
}

// Edit your own reading comment. Marks it as edited.
export async function PATCH(
  req: Request,
  {
    params,
  }: {
    params: Promise<{ studentId: string; id: string; commentId: string }>;
  },
) {
  const session = await auth();
  if (!session?.user)
    return NextResponse.json({ error: "unauth" }, { status: 401 });
  const { studentId, id, commentId } = await params;
  const ctx = await loadReadingComment(
    studentId,
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
      parentId: c.parentId,
      author: c.author,
      createdAt: c.createdAt.toISOString(),
      editedAt: c.editedAt?.toISOString() ?? null,
      mine: true,
    },
  });
}

// Delete your own reading comment, or moderate if you can write the
// student (admin or supervising team).
export async function DELETE(
  _req: Request,
  {
    params,
  }: {
    params: Promise<{ studentId: string; id: string; commentId: string }>;
  },
) {
  const session = await auth();
  if (!session?.user)
    return NextResponse.json({ error: "unauth" }, { status: 401 });
  const { studentId, id, commentId } = await params;
  const ctx = await loadReadingComment(
    studentId,
    id,
    commentId,
    session.user.id,
    session.user.role as Role,
  );
  if (!ctx) return NextResponse.json({ error: "not found" }, { status: 404 });

  const isAuthor = ctx.comment.authorId === session.user.id;
  let canModerate = isAdmin(session.user.role as Role);
  if (!isAuthor && !canModerate) {
    const access = await accessForStudent(
      studentId,
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
