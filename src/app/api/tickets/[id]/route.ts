import { NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { accessForStudent, canWriteForStudent, studentVisibilityWhereAllForAdmin, type Role } from "@/lib/access";
import { logActivity } from "@/lib/activity-log";
import { notify } from "@/lib/notify";
import { parseSubtasks, subtaskDueViolation } from "@/lib/subtasks";
import { LinkInput, sanitiseLinks, parseLinks } from "@/lib/links";
import { STATUSES, PRIORITIES, CATEGORIES } from "@/lib/kanban-constants";
import { format } from "date-fns";

const labelOf = (
  list: readonly { readonly id: string; readonly label: string }[],
  id: string | null | undefined,
) => list.find((x) => x.id === id)?.label ?? id ?? "";

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
  // Replace this task's dependency set (parent task ids).
  dependsOnIds: z.array(z.string()).optional(),
  // Replace the external-links list (use empty array to clear).
  links: z.array(LinkInput).optional(),
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
      _count: { select: { comments: true, linkedEvents: true } },
      linkedEvents: {
        select: { id: true, title: true, startsAt: true },
        orderBy: { startsAt: "asc" },
      },
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
      linkedEventCount: t._count.linkedEvents,
      linkedEvents: t.linkedEvents.map((e) => ({
        id: e.id,
        title: e.title,
        startsAt: e.startsAt.toISOString(),
      })),
      assignee: t.assignee,
      student: t.student
        ? t.student
        : { id: "__team__", fullName: "Team only", alias: null, color: "#94a3b8" },
      teamOnly: !t.studentId && !t.isGeneral,
      isGeneral: t.isGeneral,
      subtasks: parseSubtasks(t.subtasks),
      links: parseLinks(t.links),
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

  // Dependencies: validate + replace BEFORE mutating the ticket so a bad
  // dependency (cycle / cross-student) aborts cleanly with no partial write.
  if (d.dependsOnIds !== undefined) {
    const { setDependencies } = await import("@/lib/task-deps");
    const depErr = await setDependencies(id, t.studentId, d.dependsOnIds);
    if (depErr) return NextResponse.json({ error: depErr }, { status: 400 });
  }

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
  if (d.links !== undefined) {
    const sane = sanitiseLinks(d.links);
    data.links = sane.length > 0 ? JSON.stringify(sane) : null;
  }
  // "Mark as completed" (no status change) — flag it for supervisor review.
  const requestedCompletion =
    d.requestCompletion === true && d.status === undefined;
  if (requestedCompletion) data.completionRequestedAt = new Date();

  await prisma.ticket.update({ where: { id }, data });

  // Dependency gating: re-gate this task (deps changed → maybe block/unblock)
  // and, if its status changed, cascade to its dependents (a parent going
  // Done unblocks them → To do; reopening re-blocks them).
  if (d.dependsOnIds !== undefined || d.status !== undefined) {
    const { applyDependencyGate, propagateFrom } = await import(
      "@/lib/task-deps"
    );
    if (d.dependsOnIds !== undefined)
      await applyDependencyGate(id).catch(() => {});
    if (d.status !== undefined)
      await propagateFrom(id, session.user.id, session.user.role).catch(
        () => {},
      );
  }

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
    // Skipped for team-only / unassigned tasks (no student-side supervisors
    // to notify — non-student viewers see them through the activity log).
    if (t.studentId) {
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
    }
  } else {
    // Only log MATERIAL changes (so opening the form / a no-op blur / a
    // reverted value never produces a log entry), with a succinct,
    // self-explanatory summary. "Significant" workflow changes (status,
    // priority, assignee, due date, dependencies) each get their own entry;
    // minor text edits coalesce so an auto-saving form yields one row.
    const parts: string[] = [];
    let significant = false;

    if (d.status !== undefined && d.status !== t.status) {
      parts.push(`moved to ${labelOf(STATUSES, d.status)}`);
      significant = true;
    }
    if (d.priority !== undefined && d.priority !== t.priority) {
      parts.push(`priority → ${labelOf(PRIORITIES, d.priority)}`);
      significant = true;
    }
    if (d.category !== undefined && d.category !== t.category) {
      parts.push(`category → ${labelOf(CATEGORIES, d.category)}`);
    }
    if (d.dueDate !== undefined) {
      const nd = d.dueDate ? new Date(d.dueDate).getTime() : null;
      const od = t.dueDate ? t.dueDate.getTime() : null;
      if (nd !== od) {
        parts.push(
          d.dueDate
            ? `due ${format(new Date(d.dueDate), "MMM d")}`
            : "due date cleared",
        );
        significant = true;
      }
    }
    if (
      d.assigneeId !== undefined &&
      (d.assigneeId ?? null) !== (t.assigneeId ?? null)
    ) {
      let who = "someone";
      if (d.assigneeId) {
        const u = await prisma.user.findUnique({
          where: { id: d.assigneeId },
          select: { name: true },
        });
        who = u?.name ?? "someone";
        parts.push(`assigned to ${who}`);
      } else {
        parts.push("unassigned");
      }
      significant = true;
    }
    if (d.title !== undefined && d.title !== t.title) parts.push("renamed");
    if (
      d.description !== undefined &&
      (d.description ?? null) !== (t.description ?? null)
    )
      parts.push("edited the description");
    if (
      d.subtasks !== undefined &&
      JSON.stringify(d.subtasks) !== (t.subtasks ?? "[]")
    )
      parts.push("updated the checklist");
    if (
      d.driveFolderUrl !== undefined &&
      (d.driveFolderUrl ?? null) !== (t.driveFolderUrl ?? null)
    )
      parts.push(
        d.driveFolderUrl ? "linked a Drive folder" : "removed the Drive folder",
      );
    if (
      d.groupId !== undefined &&
      (d.groupId ?? null) !== (t.groupId ?? null)
    )
      parts.push(d.groupId ? "moved to a group" : "removed from its group");
    if (d.dependsOnIds !== undefined) {
      parts.push("updated dependencies");
      significant = true;
    }

    // Nothing actually changed → don't pollute the log.
    if (parts.length > 0) {
      await logActivity({
        actorId: session.user.id,
        actorRole: session.user.role,
        studentId: t.studentId,
        action: "ticket.update",
        entityType: "ticket",
        entityId: id,
        summary: `“${t.title}” — ${parts.join(", ")}`,
        details: data,
        // Burst of text-field auto-saves merges into one row; discrete
        // workflow changes stay as their own entries.
        coalesce: !significant,
        coalesceWindowMs: 3 * 60_000,
      });

      // Push a notification to the student for *meaningful* changes
      // (status / priority / assignee / due date / dependencies) so they
      // hear about it even when away. notify() skips the actor, so a
      // student editing their own task isn't notified.
      // Skipped entirely for team-only / unassigned tasks (no student to notify).
      if (significant && t.studentId) {
        const stu = await prisma.student.findUnique({
          where: { id: t.studentId },
          select: { userId: true },
        });
        if (stu?.userId)
          await notify([stu.userId], {
            type: "task.update",
            message: `Your task “${t.title}” was updated — ${parts.join(", ")}`,
            link: `/kanban?ticket=${id}`,
            actorId: session.user.id,
          }).catch(() => {});
      }
    }
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
