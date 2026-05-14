import { NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { accessForStudent, canWriteForStudent, type Role } from "@/lib/access";
import { logActivity } from "@/lib/activity-log";

const Body = z.object({
  title: z.string().min(1),
  description: z.string().optional().nullable(),
  studentId: z.string().min(1),
  assigneeId: z.string().optional().nullable(),
  status: z.string().default("todo"),
  priority: z.string().default("medium"),
  category: z.string().default("research"),
  dueDate: z.string().optional().nullable(),
  driveFolderUrl: z.string().optional().nullable(),
});

export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "unauth" }, { status: 401 });

  const json = await req.json().catch(() => null);
  const parsed = Body.safeParse(json);
  if (!parsed.success)
    return NextResponse.json({ error: "Invalid payload", issues: parsed.error.issues }, { status: 400 });

  const d = parsed.data;

  const access = await accessForStudent(
    d.studentId,
    session.user.id,
    session.user.role as Role,
  );
  if (!canWriteForStudent(access))
    return NextResponse.json(
      { error: "Only the supervisors of this student can create tasks" },
      { status: 403 },
    );

  const created = await prisma.ticket.create({
    data: {
      title: d.title,
      description: d.description || null,
      studentId: d.studentId,
      assigneeId: d.assigneeId || null,
      status: d.status,
      priority: d.priority,
      category: d.category,
      dueDate: d.dueDate ? new Date(d.dueDate) : null,
      driveFolderUrl: d.driveFolderUrl || null,
      createdById: session.user.id,
    },
    include: {
      assignee: { select: { id: true, name: true, image: true, color: true } },
      student: { select: { id: true, fullName: true, alias: true, color: true } },
      tags: true,
      _count: { select: { comments: true } },
    },
  });

  if (created.dueDate) {
    const { syncTaskDueEvent } = await import("@/lib/task-event-sync");
    await syncTaskDueEvent(created.id, session.user.id).catch((err) =>
      console.error("syncTaskDueEvent on create failed", err),
    );
  }

  await logActivity({
    actorId: session.user.id,
    actorRole: session.user.role,
    studentId: d.studentId,
    action: "ticket.create",
    entityType: "ticket",
    entityId: created.id,
    summary: `created task “${created.title}”`,
  });

  return NextResponse.json({
    ticket: {
      id: created.id,
      title: created.title,
      description: created.description,
      status: created.status,
      priority: created.priority,
      category: created.category,
      dueDate: created.dueDate?.toISOString() ?? null,
      driveFolderUrl: created.driveFolderUrl,
      channelId: created.channelId,
      order: created.order,
      commentCount: created._count.comments,
      assignee: created.assignee,
      student: created.student,
      tags: created.tags,
      subtasks: [] as { id: string; text: string; done: boolean }[],
      updatedAt: created.updatedAt.toISOString(),
    },
  });
}
