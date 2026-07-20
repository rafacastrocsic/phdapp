import { NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import {
  isAdmin,
  studentVisibilityWhereAllForAdmin,
  type Role,
} from "@/lib/access";
import { LinkInput, sanitiseLinks } from "@/lib/links";
import { logActivity } from "@/lib/activity-log";

const Patch = z.object({
  title: z.string().min(1).max(200).optional(),
  body: z.string().max(20000).nullable().optional(),
  visibility: z.enum(["supervisors", "team"]).optional(),
  studentId: z.string().nullable().optional(),
  links: z.array(LinkInput).optional(),
  driveFolderUrl: z.string().nullable().optional(),
  pinned: z.boolean().optional(),
  // true = close the thread, false = re-open.
  closed: z.boolean().optional(),
});

// Only the topic author or an admin may edit / close / pin / delete.
async function loadWritable(id: string, userId: string, role: Role) {
  const topic = await prisma.topic.findUnique({
    where: { id },
    select: { id: true, title: true, authorId: true, studentId: true },
  });
  if (!topic) return { topic: null, canWrite: false };
  const canWrite = isAdmin(role) || topic.authorId === userId;
  return { topic, canWrite };
}

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await auth();
  if (!session?.user)
    return NextResponse.json({ error: "unauth" }, { status: 401 });
  const { id } = await params;
  const role = session.user.role as Role;
  const { topic, canWrite } = await loadWritable(id, session.user.id, role);
  if (!topic) return NextResponse.json({ error: "not found" }, { status: 404 });
  if (!canWrite)
    return NextResponse.json(
      { error: "Only the topic author or an admin can edit this." },
      { status: 403 },
    );

  const parsed = Patch.safeParse(await req.json().catch(() => null));
  if (!parsed.success)
    return NextResponse.json({ error: "bad input" }, { status: 400 });
  const d = parsed.data;

  const data: Record<string, unknown> = {};
  if (d.title !== undefined) data.title = d.title.trim();
  if (d.body !== undefined) data.body = d.body?.trim() || null;
  if (d.visibility !== undefined) data.visibility = d.visibility;
  if (d.pinned !== undefined) data.pinned = d.pinned;
  if (d.closed !== undefined) data.closedAt = d.closed ? new Date() : null;
  if (d.links !== undefined) {
    const sane = sanitiseLinks(d.links);
    data.links = sane.length > 0 ? JSON.stringify(sane) : null;
  }
  if (d.driveFolderUrl !== undefined)
    data.driveFolderUrl = d.driveFolderUrl || null;

  if (d.studentId !== undefined) {
    if (d.studentId) {
      const visible = await prisma.student.findFirst({
        where: {
          id: d.studentId,
          ...studentVisibilityWhereAllForAdmin(session.user.id, role),
        },
        select: { id: true },
      });
      if (!visible)
        return NextResponse.json(
          { error: "That student isn't visible to you." },
          { status: 400 },
        );
      data.studentId = visible.id;
    } else {
      data.studentId = null;
    }
  }

  await prisma.topic.update({ where: { id }, data });

  await logActivity({
    actorId: session.user.id,
    actorRole: session.user.role,
    studentId: topic.studentId,
    action: "discussion.update",
    entityType: "topic",
    entityId: id,
    summary: `updated discussion “${topic.title}”`,
  });

  return NextResponse.json({ ok: true });
}

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await auth();
  if (!session?.user)
    return NextResponse.json({ error: "unauth" }, { status: 401 });
  const { id } = await params;
  const role = session.user.role as Role;
  const { topic, canWrite } = await loadWritable(id, session.user.id, role);
  if (!topic) return NextResponse.json({ error: "not found" }, { status: 404 });
  if (!canWrite)
    return NextResponse.json(
      { error: "Only the topic author or an admin can delete this." },
      { status: 403 },
    );

  // Comments cascade via FK.
  await prisma.topic.delete({ where: { id } });

  await logActivity({
    actorId: session.user.id,
    actorRole: session.user.role,
    studentId: topic.studentId,
    action: "discussion.delete",
    entityType: "topic",
    entityId: id,
    summary: `deleted discussion “${topic.title}”`,
  });

  return NextResponse.json({ ok: true });
}
