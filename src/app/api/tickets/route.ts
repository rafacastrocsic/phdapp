import { NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { accessForStudent, canWriteForStudent, type Role } from "@/lib/access";
import { logActivity } from "@/lib/activity-log";
import { setDependencies, applyDependencyGate } from "@/lib/task-deps";
import { LinkInput, sanitiseLinks, parseLinks } from "@/lib/links";

const Body = z.object({
  title: z.string().min(1),
  description: z.string().optional().nullable(),
  // Null = team-only task. Students cannot create one (enforced below);
  // supervisors/admin/team-advisors can.
  studentId: z.string().min(1).nullable(),
  assigneeId: z.string().optional().nullable(),
  status: z.string().default("todo"),
  priority: z.string().default("medium"),
  category: z.string().default("research"),
  dueDate: z.string().optional().nullable(),
  driveFolderUrl: z.string().optional().nullable(),
  dependsOnIds: z.array(z.string()).optional(),
  groupId: z.string().optional().nullable(),
  links: z.array(LinkInput).optional(),
});

export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "unauth" }, { status: 401 });

  const json = await req.json().catch(() => null);
  const parsed = Body.safeParse(json);
  if (!parsed.success)
    return NextResponse.json({ error: "Invalid payload", issues: parsed.error.issues }, { status: 400 });

  const d = parsed.data;

  // Students may only create tasks for themselves — never team-only.
  if ((session.user.role as Role) === "student" && !d.studentId) {
    return NextResponse.json(
      { error: "Students cannot create team-only tasks." },
      { status: 403 },
    );
  }

  const access = await accessForStudent(
    d.studentId,
    session.user.id,
    session.user.role as Role,
  );
  if (!canWriteForStudent(access))
    return NextResponse.json(
      {
        error: d.studentId
          ? "Only the supervisors of this student can create tasks"
          : "Only non-student team members can create team-only tasks",
      },
      { status: 403 },
    );

  // Students can't create a task already in Done — only supervisors set Done.
  if (d.status === "done" && access !== "supervisor")
    return NextResponse.json(
      { error: "Only a supervisor can mark a task Done." },
      { status: 403 },
    );

  // If assigning to an existing group, it must belong to the same student.
  // Team-only tasks (studentId === null) cannot belong to a group, since
  // groups are per-student.
  if (d.groupId) {
    if (!d.studentId) {
      return NextResponse.json(
        { error: "Team-only tasks cannot be grouped." },
        { status: 400 },
      );
    }
    const grp = await prisma.taskGroup.findFirst({
      where: { id: d.groupId, studentId: d.studentId },
      select: { id: true },
    });
    if (!grp)
      return NextResponse.json(
        { error: "That group doesn't belong to this student." },
        { status: 400 },
      );
  }

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
      groupId: d.groupId || null,
      createdById: session.user.id,
      links: d.links && d.links.length > 0
        ? JSON.stringify(sanitiseLinks(d.links))
        : null,
    },
    include: {
      assignee: { select: { id: true, name: true, image: true, color: true } },
      student: { select: { id: true, fullName: true, alias: true, color: true } },
      group: { select: { id: true, name: true, color: true } },
      tags: true,
      _count: { select: { comments: true, linkedEvents: true } },
    },
  });

  let effStatus = created.status;
  if (d.dependsOnIds && d.dependsOnIds.length > 0) {
    const depErr = await setDependencies(
      created.id,
      d.studentId,
      d.dependsOnIds,
    );
    if (depErr) {
      await prisma.ticket.delete({ where: { id: created.id } }).catch(() => {});
      return NextResponse.json({ error: depErr }, { status: 400 });
    }
    const gate = await applyDependencyGate(created.id);
    if (gate) effStatus = gate;
  }

  if (created.dueDate) {
    const { syncTaskDueEvent } = await import("@/lib/task-event-sync");
    await syncTaskDueEvent(created.id, session.user.id).catch((err) =>
      console.error("syncTaskDueEvent on create failed", err),
    );
  }

  if (created.assigneeId) {
    const { notify } = await import("@/lib/notify");
    await notify([created.assigneeId], {
      type: "task.assigned",
      message: `You were assigned the task “${created.title}”`,
      link: `/kanban?ticket=${created.id}`,
      actorId: session.user.id,
    }).catch(() => {});
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
      status: effStatus,
      priority: created.priority,
      category: created.category,
      dueDate: created.dueDate?.toISOString() ?? null,
      driveFolderUrl: created.driveFolderUrl,
      channelId: created.channelId,
      order: created.order,
      commentCount: created._count.comments,
      linkedEventCount: created._count.linkedEvents,
      linkedEvents: [] as { id: string; title: string; startsAt: string }[],
      assignee: created.assignee,
      student: created.student,
      group: created.group,
      tags: created.tags,
      subtasks: [] as { id: string; text: string; done: boolean }[],
      links: parseLinks(created.links),
      dependsOnIds: d.dependsOnIds ?? [],
      updatedAt: created.updatedAt.toISOString(),
    },
  });
}
