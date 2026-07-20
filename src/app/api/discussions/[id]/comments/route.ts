import { NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { isAdmin, type Role } from "@/lib/access";
import {
  isSeniorTeam,
  canSeeVisibility,
  topicParticipantIds,
} from "@/lib/discussions-access";
import { notify } from "@/lib/notify";
import { logActivity } from "@/lib/activity-log";
import {
  AttachmentInput,
  sanitiseAttachments,
  parseAttachments,
  BlockInput,
  sanitiseBlocks,
  blocksToText,
  blocksToAttachments,
  parseBlocks,
  type CommentBlock,
} from "@/lib/comment-attachments";

const Body = z.object({
  // Preferred: an ordered document (text + file blocks). Legacy body /
  // attachments are still accepted and folded into blocks below.
  blocks: z.array(BlockInput).max(200).optional(),
  body: z.string().max(20000).optional(),
  parentId: z.string().nullable().optional(),
  attachments: z.array(AttachmentInput).max(20).optional(),
});

// Load the topic if this user is allowed to read it (visibility gate).
async function authorize(topicId: string, userId: string, role: Role) {
  const topic = await prisma.topic.findUnique({
    where: { id: topicId },
    select: {
      id: true,
      title: true,
      authorId: true,
      studentId: true,
      visibility: true,
      closedAt: true,
    },
  });
  if (!topic) return null;
  const senior = await isSeniorTeam(userId, role);
  if (!canSeeVisibility(topic.visibility, senior)) return null;
  return topic;
}

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await auth();
  if (!session?.user)
    return NextResponse.json({ error: "unauth" }, { status: 401 });
  const { id } = await params;
  const topic = await authorize(id, session.user.id, session.user.role as Role);
  if (!topic) return NextResponse.json({ error: "not found" }, { status: 404 });

  const comments = await prisma.comment.findMany({
    where: { topicId: id },
    include: {
      author: { select: { id: true, name: true, image: true, color: true } },
    },
    orderBy: { createdAt: "asc" },
  });

  // The topic author + any admin can moderate (delete) others' comments.
  const canModerate =
    isAdmin(session.user.role as Role) || topic.authorId === session.user.id;

  return NextResponse.json({
    canModerate,
    comments: comments.map((c) => ({
      id: c.id,
      body: c.body,
      parentId: c.parentId,
      author: {
        name: c.author.name,
        image: c.author.image,
        color: c.author.color,
      },
      createdAt: c.createdAt.toISOString(),
      editedAt: c.editedAt?.toISOString() ?? null,
      attachments: parseAttachments(c.attachments),
      blocks: parseBlocks(c.blocks),
      mine: c.author.id === session.user.id,
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
  const topic = await authorize(id, session.user.id, session.user.role as Role);
  if (!topic) return NextResponse.json({ error: "not found" }, { status: 404 });
  if (topic.closedAt)
    return NextResponse.json(
      { error: "This discussion is closed." },
      { status: 403 },
    );

  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success)
    return NextResponse.json({ error: "bad input" }, { status: 400 });

  // Build the ordered block list. Prefer explicit `blocks`; otherwise fold
  // any legacy body + attachments into an equivalent block sequence.
  let blocks: CommentBlock[] =
    parsed.data.blocks && parsed.data.blocks.length > 0
      ? sanitiseBlocks(parsed.data.blocks)
      : [];
  if (blocks.length === 0) {
    const legacyText = (parsed.data.body ?? "").trim();
    if (legacyText) blocks.push({ type: "text", text: legacyText });
    for (const a of sanitiseAttachments(parsed.data.attachments ?? []))
      blocks.push({ type: "file", ...a });
  }
  if (blocks.length === 0)
    return NextResponse.json(
      { error: "Add some text or an attachment." },
      { status: 400 },
    );
  const body = blocksToText(blocks);
  const attachments = blocksToAttachments(blocks);

  let parentId: string | null = null;
  if (parsed.data.parentId) {
    const parent = await prisma.comment.findUnique({
      where: { id: parsed.data.parentId },
      select: { id: true, topicId: true },
    });
    if (!parent || parent.topicId !== id)
      return NextResponse.json({ error: "bad parent" }, { status: 400 });
    parentId = parent.id;
  }

  const c = await prisma.comment.create({
    data: {
      topicId: id,
      parentId,
      body,
      attachments:
        attachments.length > 0 ? JSON.stringify(attachments) : null,
      blocks: JSON.stringify(blocks),
      authorId: session.user.id,
    },
    include: { author: { select: { name: true, image: true, color: true } } },
  });

  // Bump the topic's activity clock so the list re-sorts by real recency.
  await prisma.topic.update({
    where: { id },
    data: { lastActivityAt: new Date() },
  });

  // Notify the topic author + everyone who's already in the thread.
  const recipients = await topicParticipantIds(id, topic.authorId);
  await notify(recipients, {
    type: "discussion.comment",
    message: parentId
      ? `New reply in discussion “${topic.title}”`
      : `New comment in discussion “${topic.title}”`,
    link: `/discussions/${id}`,
    actorId: session.user.id,
  }).catch(() => {});

  await logActivity({
    actorId: session.user.id,
    actorRole: session.user.role,
    studentId: topic.studentId,
    action: "discussion.comment",
    entityType: "topic",
    entityId: id,
    summary: `commented in discussion “${topic.title}”`,
  });

  return NextResponse.json({
    comment: {
      id: c.id,
      body: c.body,
      parentId: c.parentId,
      author: c.author,
      createdAt: c.createdAt.toISOString(),
      editedAt: null as string | null,
      attachments,
      blocks,
      mine: true,
    },
  });
}
