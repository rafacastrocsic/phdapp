import { NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { isAdmin, type Role } from "@/lib/access";
import { isSeniorTeam } from "@/lib/discussions-access";
import { notify } from "@/lib/notify";

const Body = z.object({
  body: z.string().min(1),
  parentId: z.string().nullable().optional(),
});

// Load the involvement + this caller's rights on its comment thread.
// Only senior-team members take part; a member may READ comments on their
// own item or on any SHARED item, and may POST on their own item or on a
// shared item whose owner enabled comments.
async function ctx(involvementId: string, userId: string, role: Role) {
  if (!(await isSeniorTeam(userId, role))) return null;
  const item = await prisma.involvement.findUnique({
    where: { id: involvementId },
    select: {
      id: true,
      title: true,
      ownerId: true,
      shared: true,
      allowComments: true,
    },
  });
  if (!item) return null;
  const isOwner = item.ownerId === userId;
  const canSee = isOwner || item.shared;
  if (!canSee) return null;
  const canPost = isOwner || (item.shared && item.allowComments);
  const canModerate = isAdmin(role) || isOwner;
  return { item, isOwner, canPost, canModerate };
}

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await auth();
  if (!session?.user)
    return NextResponse.json({ error: "unauth" }, { status: 401 });
  const { id } = await params;
  const c = await ctx(id, session.user.id, session.user.role as Role);
  if (!c) return NextResponse.json({ error: "not found" }, { status: 404 });

  const comments = await prisma.comment.findMany({
    where: { involvementId: id },
    include: {
      author: { select: { id: true, name: true, image: true, color: true } },
    },
    orderBy: { createdAt: "asc" },
  });
  return NextResponse.json({
    canModerate: c.canModerate,
    comments: comments.map((cm) => ({
      id: cm.id,
      body: cm.body,
      parentId: cm.parentId,
      author: { name: cm.author.name, image: cm.author.image, color: cm.author.color },
      createdAt: cm.createdAt.toISOString(),
      editedAt: cm.editedAt?.toISOString() ?? null,
      mine: cm.author.id === session.user.id,
    })),
  });
}

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await auth();
  if (!session?.user)
    return NextResponse.json({ error: "unauth" }, { status: 401 });
  const { id } = await params;
  const c = await ctx(id, session.user.id, session.user.role as Role);
  if (!c) return NextResponse.json({ error: "not found" }, { status: 404 });
  if (!c.canPost)
    return NextResponse.json(
      { error: "Comments aren't open on this item." },
      { status: 403 },
    );

  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success)
    return NextResponse.json({ error: "bad input" }, { status: 400 });

  let parentId: string | null = null;
  if (parsed.data.parentId) {
    const parent = await prisma.comment.findUnique({
      where: { id: parsed.data.parentId },
      select: { id: true, involvementId: true },
    });
    if (!parent || parent.involvementId !== id)
      return NextResponse.json({ error: "bad parent" }, { status: 400 });
    parentId = parent.id;
  }

  const cm = await prisma.comment.create({
    data: {
      involvementId: id,
      parentId,
      body: parsed.data.body,
      authorId: session.user.id,
    },
    include: { author: { select: { name: true, image: true, color: true } } },
  });

  // Notify the item's owner + anyone already in the thread (not the actor).
  const others = await prisma.comment.findMany({
    where: { involvementId: id },
    select: { authorId: true },
    distinct: ["authorId"],
  });
  await notify(
    [c.item.ownerId, ...others.map((o) => o.authorId)],
    {
      type: "involvement.comment",
      message: `New comment on “${c.item.title}” (My Work)`,
      link: "/my-work",
      actorId: session.user.id,
    },
  ).catch(() => {});

  return NextResponse.json({
    comment: {
      id: cm.id,
      body: cm.body,
      parentId: cm.parentId,
      author: cm.author,
      createdAt: cm.createdAt.toISOString(),
      editedAt: null as string | null,
      mine: true,
    },
  });
}
