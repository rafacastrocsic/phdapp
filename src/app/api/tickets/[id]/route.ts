import { NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { accessForStudent, canWriteForStudent, studentVisibilityWhereAllForAdmin, type Role } from "@/lib/access";
import { logActivity } from "@/lib/activity-log";

const SubtaskItem = z.object({
  id: z.string(),
  text: z.string(),
  done: z.boolean(),
});

const Patch = z.object({
  title: z.string().optional(),
  description: z.string().nullable().optional(),
  status: z.string().optional(),
  priority: z.string().optional(),
  category: z.string().optional(),
  assigneeId: z.string().nullable().optional(),
  dueDate: z.string().nullable().optional(),
  driveFolderUrl: z.string().nullable().optional(),
  subtasks: z.array(SubtaskItem).optional(),
  assignee: z.any().optional(), // ignored — client field
});

async function load(id: string, userId: string, role: Role) {
  return prisma.ticket.findFirst({
    where: {
      id,
      student: studentVisibilityWhereAllForAdmin(userId, role),
    },
  });
}

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "unauth" }, { status: 401 });
  const { id } = await params;
  const t = await load(id, session.user.id, session.user.role as Role);
  if (!t) return NextResponse.json({ error: "not found" }, { status: 404 });

  const access = await accessForStudent(
    t.studentId,
    session.user.id,
    session.user.role as Role,
  );
  if (!canWriteForStudent(access))
    return NextResponse.json(
      { error: "Only the supervisors of this student can edit tasks" },
      { status: 403 },
    );

  const json = await req.json().catch(() => null);
  const parsed = Patch.safeParse(json);
  if (!parsed.success) return NextResponse.json({ error: "bad input" }, { status: 400 });
  const d = parsed.data;

  const data: Record<string, unknown> = {};
  if (d.title !== undefined) data.title = d.title;
  if (d.description !== undefined) data.description = d.description;
  if (d.status !== undefined) {
    data.status = d.status;
    if (d.status === "done") data.completedAt = new Date();
    if (d.status === "in_progress" && !t.startedAt) data.startedAt = new Date();
  }
  if (d.priority !== undefined) data.priority = d.priority;
  if (d.category !== undefined) data.category = d.category;
  if (d.assigneeId !== undefined) data.assigneeId = d.assigneeId;
  if (d.dueDate !== undefined) data.dueDate = d.dueDate ? new Date(d.dueDate) : null;
  if (d.driveFolderUrl !== undefined) data.driveFolderUrl = d.driveFolderUrl;
  if (d.subtasks !== undefined) data.subtasks = JSON.stringify(d.subtasks);

  await prisma.ticket.update({ where: { id }, data });

  await logActivity({
    actorId: session.user.id,
    actorRole: session.user.role,
    studentId: t.studentId,
    action: "ticket.update",
    entityType: "ticket",
    entityId: id,
    summary:
      d.status && d.status !== t.status
        ? `moved task “${t.title}” → ${d.status.replace("_", " ")}`
        : `updated task “${t.title}” (${Object.keys(data).join(", ")})`,
    details: data,
  });

  return NextResponse.json({ ok: true });
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "unauth" }, { status: 401 });
  const { id } = await params;
  const t = await load(id, session.user.id, session.user.role as Role);
  if (!t) return NextResponse.json({ error: "not found" }, { status: 404 });

  const access = await accessForStudent(
    t.studentId,
    session.user.id,
    session.user.role as Role,
  );
  if (!canWriteForStudent(access))
    return NextResponse.json(
      { error: "You don't have permission to delete this task" },
      { status: 403 },
    );

  await prisma.ticket.delete({ where: { id } });

  await logActivity({
    actorId: session.user.id,
    actorRole: session.user.role,
    studentId: t.studentId,
    action: "ticket.delete",
    entityType: "ticket",
    entityId: id,
    summary: `deleted task “${t.title}”`,
  });

  return NextResponse.json({ ok: true });
}
