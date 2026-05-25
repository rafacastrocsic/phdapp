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
import { logActivity } from "@/lib/activity-log";
import { notify } from "@/lib/notify";

const Body = z.object({
  body: z.string().min(1),
  parentId: z.string().nullable().optional(),
});

// A reading item belongs to a student. Anyone who can see that student
// (admin / supervising team / the student themselves) can comment.
// `studentId` is checked against the URL to prevent guessing item ids
// across students.
async function authorize(
  studentId: string,
  readingItemId: string,
  userId: string,
  role: Role,
) {
  // Visibility on the student
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
    select: {
      id: true,
      title: true,
      studentId: true,
      addedById: true,
      decisionById: true,
    },
  });
  return item;
}

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ studentId: string; id: string }> },
) {
  const session = await auth();
  if (!session?.user)
    return NextResponse.json({ error: "unauth" }, { status: 401 });
  const { studentId, id } = await params;
  const ok = await authorize(studentId, id, session.user.id, session.user.role as Role);
  if (!ok) return NextResponse.json({ error: "not found" }, { status: 404 });

  const comments = await prisma.comment.findMany({
    where: { readingItemId: id },
    include: {
      author: { select: { id: true, name: true, image: true, color: true } },
    },
    orderBy: { createdAt: "asc" },
  });

  // Anyone who can write the student (or any admin) may moderate
  // (delete) others' comments. Same rule as Tasks/Events.
  let canModerate = isAdmin(session.user.role as Role);
  if (!canModerate) {
    const access = await accessForStudent(
      studentId,
      session.user.id,
      session.user.role as Role,
    );
    canModerate = canWriteForStudent(access);
  }

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
      mine: c.author.id === session.user.id,
    })),
  });
}

export async function POST(
  req: Request,
  { params }: { params: Promise<{ studentId: string; id: string }> },
) {
  const session = await auth();
  if (!session?.user)
    return NextResponse.json({ error: "unauth" }, { status: 401 });
  const { studentId, id } = await params;
  const item = await authorize(studentId, id, session.user.id, session.user.role as Role);
  if (!item) return NextResponse.json({ error: "not found" }, { status: 404 });

  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success)
    return NextResponse.json({ error: "bad input" }, { status: 400 });

  let parentId: string | null = null;
  let parentAuthorId: string | null = null;
  if (parsed.data.parentId) {
    const parent = await prisma.comment.findUnique({
      where: { id: parsed.data.parentId },
      select: { id: true, readingItemId: true, authorId: true },
    });
    if (!parent || parent.readingItemId !== id)
      return NextResponse.json({ error: "bad parent" }, { status: 400 });
    parentId = parent.id;
    parentAuthorId = parent.authorId;
  }

  const c = await prisma.comment.create({
    data: {
      readingItemId: id,
      parentId,
      body: parsed.data.body,
      authorId: session.user.id,
    },
    include: { author: { select: { name: true, image: true, color: true } } },
  });
  const newComment = {
    id: c.id,
    body: c.body,
    parentId: c.parentId,
    author: c.author,
    createdAt: c.createdAt.toISOString(),
    editedAt: null as string | null,
    mine: true,
  };

  // Notify the people who actually care about this thread:
  //   - the item's original proposer (often the student),
  //   - the supervisor who approved/rejected it (if any),
  //   - the student themselves (their user account, if linked),
  //   - on a reply, the parent comment's author.
  // notify() de-dupes and skips the actor.
  const stu = await prisma.student.findUnique({
    where: { id: studentId },
    select: { userId: true },
  });
  await notify(
    [item.addedById, item.decisionById, stu?.userId, parentAuthorId],
    {
      type: "reading.comment",
      message: parentId
        ? `New reply on “${item.title}”`
        : `New comment on “${item.title}”`,
      link: "/reading",
      actorId: session.user.id,
    },
  ).catch(() => {});

  // Mirror as a reading activity so the Reading sidebar bubble +
  // version-gated poll pick this up.
  await logActivity({
    actorId: session.user.id,
    actorRole: session.user.role,
    studentId,
    action: "reading.comment",
    entityType: "reading",
    entityId: id,
    summary: `commented on reading item “${item.title}”`,
  });

  return NextResponse.json({ comment: newComment });
}
