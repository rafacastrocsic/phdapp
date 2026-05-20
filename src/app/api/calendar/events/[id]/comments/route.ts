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

// Anyone who can see the event can comment on it. Visibility:
//   - admins → any event
//   - the event owner → their own
//   - users with read access to the event's student → that event
//   - (rare) events with no student (general) → only admins/the owner
async function authorize(eventId: string, userId: string, role: Role) {
  const event = await prisma.event.findUnique({
    where: { id: eventId },
    select: {
      id: true,
      title: true,
      ownerId: true,
      studentId: true,
    },
  });
  if (!event) return null;
  if (isAdmin(role)) return event;
  if (event.ownerId === userId) return event;
  if (event.studentId) {
    const visible = await prisma.student.findFirst({
      where: {
        id: event.studentId,
        ...studentVisibilityWhereAllForAdmin(userId, role),
      },
      select: { id: true },
    });
    if (visible) return event;
  }
  return null;
}

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await auth();
  if (!session?.user)
    return NextResponse.json({ error: "unauth" }, { status: 401 });
  const { id } = await params;
  const ok = await authorize(id, session.user.id, session.user.role as Role);
  if (!ok) return NextResponse.json({ error: "not found" }, { status: 404 });

  const comments = await prisma.comment.findMany({
    where: { eventId: id },
    include: {
      author: { select: { id: true, name: true, image: true, color: true } },
    },
    orderBy: { createdAt: "asc" },
  });

  // Anyone who can write the student-of-the-event (or any admin) may
  // moderate (delete) others' comments. Without a student → admin only.
  let canModerate = isAdmin(session.user.role as Role);
  if (!canModerate && ok.studentId) {
    const access = await accessForStudent(
      ok.studentId,
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
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await auth();
  if (!session?.user)
    return NextResponse.json({ error: "unauth" }, { status: 401 });
  const { id } = await params;
  const ok = await authorize(id, session.user.id, session.user.role as Role);
  if (!ok) return NextResponse.json({ error: "not found" }, { status: 404 });

  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success)
    return NextResponse.json({ error: "bad input" }, { status: 400 });

  let parentId: string | null = null;
  let parentAuthorId: string | null = null;
  if (parsed.data.parentId) {
    const parent = await prisma.comment.findUnique({
      where: { id: parsed.data.parentId },
      select: { id: true, eventId: true, authorId: true },
    });
    if (!parent || parent.eventId !== id)
      return NextResponse.json({ error: "bad parent" }, { status: 400 });
    parentId = parent.id;
    parentAuthorId = parent.authorId;
  }

  const c = await prisma.comment.create({
    data: {
      eventId: id,
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

  // Notify the event owner, the event's student (their user account),
  // and — on a reply — the parent comment's author. notify() skips the
  // actor themselves.
  const stu = ok.studentId
    ? await prisma.student.findUnique({
        where: { id: ok.studentId },
        select: { userId: true },
      })
    : null;
  await notify([ok.ownerId, stu?.userId, parentAuthorId], {
    type: "event.comment",
    message: parentId
      ? `New reply on event “${ok.title}”`
      : `New comment on event “${ok.title}”`,
    link: "/calendar",
    actorId: session.user.id,
  }).catch(() => {});

  // Mirror as event.update so the Calendar's recent-activity banner
  // highlights this event for other team members.
  await logActivity({
    actorId: session.user.id,
    actorRole: session.user.role,
    studentId: ok.studentId,
    action: "event.update",
    entityType: "event",
    entityId: id,
    summary: `commented on event “${ok.title}”`,
  });

  return NextResponse.json({ comment: newComment });
}
