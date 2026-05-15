import { NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { studentVisibilityWhereAllForAdmin, type Role } from "@/lib/access";
import { logActivity } from "@/lib/activity-log";

const Body = z.object({ body: z.string().min(1) });

async function authorize(id: string, userId: string, role: Role) {
  return prisma.ticket.findFirst({
    where: { id, student: studentVisibilityWhereAllForAdmin(userId, role) },
    select: {
      id: true,
      studentId: true,
      title: true,
      assigneeId: true,
      createdById: true,
    },
  });
}

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "unauth" }, { status: 401 });
  const { id } = await params;
  const ok = await authorize(id, session.user.id, session.user.role as Role);
  if (!ok) return NextResponse.json({ error: "not found" }, { status: 404 });

  const comments = await prisma.comment.findMany({
    where: { ticketId: id },
    include: { author: { select: { name: true, image: true, color: true } } },
    orderBy: { createdAt: "asc" },
  });
  return NextResponse.json({
    comments: comments.map((c) => ({
      id: c.id,
      body: c.body,
      author: c.author,
      createdAt: c.createdAt.toISOString(),
    })),
  });
}

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "unauth" }, { status: 401 });
  const { id } = await params;
  const ok = await authorize(id, session.user.id, session.user.role as Role);
  if (!ok) return NextResponse.json({ error: "not found" }, { status: 404 });

  const json = await req.json().catch(() => null);
  const parsed = Body.safeParse(json);
  if (!parsed.success) return NextResponse.json({ error: "bad input" }, { status: 400 });

  const c = await prisma.comment.create({
    data: { ticketId: id, body: parsed.data.body, authorId: session.user.id },
    include: { author: { select: { name: true, image: true, color: true } } },
  });

  {
    const { notify } = await import("@/lib/notify");
    await notify([ok.assigneeId, ok.createdById], {
      type: "task.comment",
      message: `New comment on “${ok.title}”`,
      link: `/kanban?ticket=${id}`,
      actorId: session.user.id,
    }).catch(() => {});
  }

  // Mirror this as a ticket.update so the Tasks board highlights the task
  // for other team members until they next visit /kanban.
  await logActivity({
    actorId: session.user.id,
    actorRole: session.user.role,
    studentId: ok.studentId,
    action: "ticket.update",
    entityType: "ticket",
    entityId: id,
    summary: `commented on “${ok.title}”`,
  });

  return NextResponse.json({
    comment: {
      id: c.id,
      body: c.body,
      author: c.author,
      createdAt: c.createdAt.toISOString(),
    },
  });
}
