import { NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { accessForStudent, canWriteForStudent, studentVisibilityWhereAllForAdmin, type Role } from "@/lib/access";
import { logActivity } from "@/lib/activity-log";
import { notify } from "@/lib/notify";
import { parseSubtasks, subtaskDueViolation } from "@/lib/subtasks";

const SubtaskItem = z.object({
  id: z.string(),
  text: z.string(),
  done: z.boolean(),
  due: z.string().nullable().optional(),
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
  // Student action: "Mark as completed" — requests a supervisor to set Done.
  requestCompletion: z.boolean().optional(),
  // null = remove from its group.
  groupId: z.string().nullable().optional(),
});

async function load(id: string, userId: string, role: Role) {
  return prisma.ticket.findFirst({
    where: {
      id,
      student: studentVisibilityWhereAllForAdmin(userId, role),
    },
  });
}

// Read-only single ticket (visibility-scoped) — powers the in-place
// "task peek" opened from Calendar / Log so you don't leave that module.
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "unauth" }, { status: 401 });
  const { id } = await params;
  const t = await prisma.ticket.findFirst({
    where: {
      id,
      archivedAt: null,
      student: studentVisibilityWhereAllForAdmin(
        session.user.id,
        session.user.role as Role,
      ),
    },
    include: {
      assignee: { select: { id: true, name: true, image: true, color: true } },
      student: { select: { id: true, fullName: true, alias: true, color: true } },
      _count: { select: { comments: true } },
    },
  });
  if (!t) return NextResponse.json({ error: "not found" }, { status: 404 });
  return NextResponse.json({
    ticket: {
      id: t.id,
      title: t.title,
      description: t.description,
      status: t.status,
      priority: t.priority,
      category: t.category,
      dueDate: t.dueDate?.toISOString() ?? null,
      driveFolderUrl: t.driveFolderUrl,
      commentCount: t._count.comments,
      assignee: t.assignee,
      student: t.student,
      subtasks: parseSubtasks(t.subtasks),
      updatedAt: t.updatedAt.toISOString(),
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

  const isSupervisorActor = access === "supervisor"; // supervisor or admin
  // Students can't move a task to Done — they request it via "Mark as
  // completed"; a supervisor reviews and sets Done.
  if (d.status === "done" && !isSupervisorActor)
    return NextResponse.json(
      {
        error:
          "Only a supervisor can mark a task Done. Use “Mark as completed” to request it.",
      },
      { status: 403 },
    );

  // A sub-task deadline may never fall after the task's deadline. Validate
  // the EFFECTIVE state (incoming subtasks/dueDate falling back to current)
  // so lowering the task's own due date also gets caught.
  const effectiveSubtasks =
    d.subtasks !== undefined ? d.subtasks : parseSubtasks(t.subtasks);
  const effectiveTaskDue =
    d.dueDate !== undefined
      ? d.dueDate
        ? new Date(d.dueDate)
        : null
      : t.dueDate;
  const violation = subtaskDueViolation(effectiveSubtasks, effectiveTaskDue);
  if (violation)
    return NextResponse.json({ error: violation }, { status: 400 });

  const data: Record<string, unknown> = {};
  if (d.title !== undefined) data.title = d.title;
  if (d.description !== undefined) data.description = d.description;
  if (d.status !== undefined) {
    data.status = d.status;
    if (d.status === "done") data.completedAt = new Date();
    if (d.status === "in_progress" && !t.startedAt) data.startedAt = new Date();
    // A status change resolves/supersedes any pending completion request.
    data.completionRequestedAt = null;
  }
  if (d.priority !== undefined) data.priority = d.priority;
  if (d.category !== undefined) data.category = d.category;
  if (d.assigneeId !== undefined) data.assigneeId = d.assigneeId;
  if (d.dueDate !== undefined) data.dueDate = d.dueDate ? new Date(d.dueDate) : null;
  if (d.driveFolderUrl !== undefined) data.driveFolderUrl = d.driveFolderUrl;
  if (d.groupId !== undefined) data.groupId = d.groupId;
  if (d.subtasks !== undefined) data.subtasks = JSON.stringify(d.subtasks);
  // "Mark as completed" (no status change) — flag it for supervisor review.
  const requestedCompletion =
    d.requestCompletion === true && d.status === undefined;
  if (requestedCompletion) data.completionRequestedAt = new Date();

  await prisma.ticket.update({ where: { id }, data });

  // If due date or title/description changed, keep the linked calendar event
  // in sync (creates / updates / deletes as appropriate).
  if (
    d.dueDate !== undefined ||
    d.title !== undefined ||
    d.description !== undefined
  ) {
    const { syncTaskDueEvent } = await import("@/lib/task-event-sync");
    await syncTaskDueEvent(id, session.user.id).catch((err) =>
      console.error("syncTaskDueEvent on patch failed", err),
    );
  }
  // Sub-task deadline calendar events (title also changes if the task was
  // renamed → resync on title change too).
  if (d.subtasks !== undefined || d.title !== undefined) {
    const { syncSubtaskDueEvents } = await import("@/lib/task-event-sync");
    await syncSubtaskDueEvents(id, session.user.id).catch((err) =>
      console.error("syncSubtaskDueEvents on patch failed", err),
    );
  }

  if (requestedCompletion) {
    await logActivity({
      actorId: session.user.id,
      actorRole: session.user.role,
      studentId: t.studentId,
      action: "ticket.completion_requested",
      entityType: "ticket",
      entityId: id,
      summary: `marked task “${t.title}” as completed — awaiting a supervisor to set it Done`,
    });
    // Best-effort ping to the student's supervisors (email if configured;
    // the activity entry above already drives the 🔔 bell + Tasks badge).
    const sups = await prisma.student.findUnique({
      where: { id: t.studentId },
      select: {
        supervisorId: true,
        coSupervisors: {
          where: { role: { in: ["supervisor", "co_supervisor"] } },
          select: { userId: true },
        },
      },
    });
    const ids = [
      ...(sups?.supervisorId ? [sups.supervisorId] : []),
      ...(sups?.coSupervisors.map((c) => c.userId) ?? []),
    ];
    await notify(ids, {
      type: "task.completion",
      message: `“${t.title}” was marked completed — review it and move it to Done.`,
      link: `/kanban?ticket=${id}`,
      actorId: session.user.id,
    }).catch(() => {});
  } else {
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
  }

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

  // Remove the linked Google Calendar event (recreated on undo if it had a
  // due date). The Ticket row itself is SOFT-deleted so it can be restored.
  {
    const { deleteTaskDueEvent, deleteSubtaskDueEvents } = await import(
      "@/lib/task-event-sync"
    );
    await deleteTaskDueEvent(id, session.user.id).catch((err) =>
      console.error("deleteTaskDueEvent failed", err),
    );
    await deleteSubtaskDueEvents(id).catch((err) =>
      console.error("deleteSubtaskDueEvents failed", err),
    );
  }

  await prisma.ticket.update({
    where: { id },
    data: { archivedAt: new Date() },
  });

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
