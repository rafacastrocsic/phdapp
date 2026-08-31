import { NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { isAdmin, type Role } from "@/lib/access";
import { isSeniorTeam } from "@/lib/discussions-access";

const Body = z.object({ body: z.string().min(1) });

async function load(
  involvementId: string,
  commentId: string,
  userId: string,
  role: Role,
) {
  if (!(await isSeniorTeam(userId, role))) return null;
  const item = await prisma.involvement.findUnique({
    where: { id: involvementId },
    select: { id: true, ownerId: true, shared: true },
  });
  if (!item) return null;
  if (item.ownerId !== userId && !item.shared) return null;
  const comment = await prisma.comment.findFirst({
    where: { id: commentId, involvementId },
    select: { id: true, authorId: true },
  });
  if (!comment) return null;
  return { item, comment };
}

// Edit your own comment.
export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string; commentId: string }> },
) {
  const session = await auth();
  if (!session?.user)
    return NextResponse.json({ error: "unauth" }, { status: 401 });
  const { id, commentId } = await params;
  const ctx = await load(id, commentId, session.user.id, session.user.role as Role);
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

// Delete your own comment, or moderate if you own the involvement / are admin.
export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string; commentId: string }> },
) {
  const session = await auth();
  if (!session?.user)
    return NextResponse.json({ error: "unauth" }, { status: 401 });
  const { id, commentId } = await params;
  const ctx = await load(id, commentId, session.user.id, session.user.role as Role);
  if (!ctx) return NextResponse.json({ error: "not found" }, { status: 404 });

  const isAuthor = ctx.comment.authorId === session.user.id;
  const canModerate =
    isAdmin(session.user.role as Role) || ctx.item.ownerId === session.user.id;
  if (!isAuthor && !canModerate)
    return NextResponse.json(
      { error: "You can't delete this comment" },
      { status: 403 },
    );

  await prisma.comment.delete({ where: { id: commentId } });
  return NextResponse.json({ ok: true });
}
