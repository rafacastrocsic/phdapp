import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { studentVisibilityWhere, type Role } from "@/lib/access";
import { clearDismissedTicketIds } from "@/lib/kanban-dismissed";
import { parseSubtasks } from "@/lib/subtasks";
import { KanbanBoard } from "./kanban-board";

export default async function KanbanPage({
  searchParams,
}: {
  searchParams: Promise<{ student?: string; ticket?: string; new?: string }>;
}) {
  const sp = await searchParams;
  const session = (await auth())!;
  const role = session.user.role as Role;

  const students = await prisma.student.findMany({
    where: studentVisibilityWhere(session.user.id, role),
    select: { id: true, fullName: true, alias: true, color: true, avatarUrl: true },
    orderBy: { fullName: "asc" },
  });
  const studentIds = students.map((s) => s.id);

  const tickets = await prisma.ticket.findMany({
    where: {
      studentId: { in: studentIds },
      archivedAt: null,
      ...(sp.student ? { studentId: sp.student } : {}),
    },
    include: {
      assignee: { select: { id: true, name: true, image: true, color: true } },
      student: { select: { id: true, fullName: true, alias: true, color: true } },
      tags: true,
      _count: { select: { comments: true } },
    },
    orderBy: [{ status: "asc" }, { order: "asc" }, { createdAt: "desc" }],
  });

  const teamMembers = await prisma.user.findMany({
    where: { role: { in: ["admin", "supervisor"] } },
    select: { id: true, name: true, image: true, color: true, role: true },
  });

  // Snapshot the tickets that changed since user last saw the kanban.
  const me = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { kanbanLastSeenAt: true },
  });
  const since = me?.kanbanLastSeenAt ?? new Date(0);
  const recentLogs = await prisma.activityLog.findMany({
    where: {
      studentId: { in: studentIds },
      actorId: { not: session.user.id },
      action: { in: ["ticket.create", "ticket.update"] },
      createdAt: { gt: since },
    },
    select: { entityId: true, action: true },
    orderBy: { createdAt: "asc" },
  });
  // For each ticket, classify as "new" if there's a create log, otherwise "updated".
  const highlightByTicket: Record<string, "new" | "updated"> = {};
  for (const l of recentLogs) {
    if (!l.entityId) continue;
    if (l.action === "ticket.create") {
      highlightByTicket[l.entityId] = "new";
    } else if (!highlightByTicket[l.entityId]) {
      highlightByTicket[l.entityId] = "updated";
    }
  }

  // Server-backed ghost cards: tasks deleted by others since the user's last
  // /kanban visit (soft-deleted rows still exist). Survives reload until the
  // user visits /kanban (which bumps kanbanLastSeenAt below).
  const deleteLogs = await prisma.activityLog.findMany({
    where: {
      studentId: { in: studentIds },
      actorId: { not: session.user.id },
      action: "ticket.delete",
      createdAt: { gt: since },
    },
    select: { entityId: true },
  });
  const deletedIds = Array.from(
    new Set(deleteLogs.map((l) => l.entityId).filter((x): x is string => !!x)),
  );
  const deletedTickets = deletedIds.length
    ? await prisma.ticket.findMany({
        where: { id: { in: deletedIds }, archivedAt: { not: null } },
        include: {
          assignee: { select: { id: true, name: true, image: true, color: true } },
          student: { select: { id: true, fullName: true, alias: true, color: true } },
          tags: true,
          _count: { select: { comments: true } },
        },
      })
    : [];

  // Mark as seen now so the sidebar badge resets on next poll. (Local
  // highlights remain visible since they're a snapshot computed before this.)
  await prisma.user.update({
    where: { id: session.user.id },
    data: { kanbanLastSeenAt: new Date() },
  });
  // Reset per-ticket dismissals — a fresh /kanban visit is the cleanest place to do that.
  await clearDismissedTicketIds(session.user.id);

  // For students: their own studentId so the new-ticket form pre-fills,
  // and their team members (primary supervisor + co-supervisors) so the
  // assignee picker shows the right options.
  const viewerStudent = role === "student"
    ? await prisma.student.findFirst({
        where: { userId: session.user.id },
        select: {
          id: true,
          supervisorId: true,
          supervisor: { select: { id: true, name: true, image: true, color: true, role: true } },
          coSupervisors: {
            include: {
              user: { select: { id: true, name: true, image: true, color: true, role: true } },
            },
          },
        },
      })
    : null;

  // Build the student's team for assignee restriction.
  const viewerTeamMembers = viewerStudent
    ? [
        viewerStudent.supervisor,
        ...viewerStudent.coSupervisors.map((cs) => cs.user),
      ]
    : [];

  return (
    <KanbanBoard
      tickets={tickets.map((t) => ({
        id: t.id,
        title: t.title,
        description: t.description,
        status: t.status,
        priority: t.priority,
        category: t.category,
        dueDate: t.dueDate?.toISOString() ?? null,
        driveFolderUrl: t.driveFolderUrl,
        channelId: t.channelId,
        order: t.order,
        commentCount: t._count.comments,
        assignee: t.assignee,
        student: t.student,
        tags: t.tags,
        subtasks: parseSubtasks(t.subtasks),
        updatedAt: t.updatedAt.toISOString(),
      }))}
      students={students}
      teamMembers={teamMembers}
      filterStudent={sp.student ?? null}
      openTicketId={sp.ticket ?? null}
      autoOpenNew={sp.new === "1"}
      viewerId={session.user.id}
      viewerRole={role}
      viewerStudentId={viewerStudent?.id ?? null}
      viewerTeamMembers={viewerTeamMembers}
      highlightByTicket={highlightByTicket}
      initialDeleted={deletedTickets.map((t) => ({
        id: t.id,
        title: t.title,
        description: t.description,
        status: t.status,
        priority: t.priority,
        category: t.category,
        dueDate: t.dueDate?.toISOString() ?? null,
        driveFolderUrl: t.driveFolderUrl,
        channelId: t.channelId,
        order: t.order,
        commentCount: t._count.comments,
        assignee: t.assignee,
        student: t.student,
        tags: t.tags,
        subtasks: parseSubtasks(t.subtasks),
        updatedAt: t.updatedAt.toISOString(),
      }))}
    />
  );
}
