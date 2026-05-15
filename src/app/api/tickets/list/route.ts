import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { studentVisibilityWhere, type Role } from "@/lib/access";
import { getDismissedTicketIds } from "@/lib/kanban-dismissed";
import { parseSubtasks } from "@/lib/subtasks";

/**
 * Polled by the Kanban board client to refresh tickets and highlights without
 * doing a full page reload. Does NOT touch kanbanLastSeenAt, so highlights
 * keep showing until the user navigates back to /kanban.
 */
export async function GET(req: Request) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "unauth" }, { status: 401 });

  const url = new URL(req.url);
  const studentFilter = url.searchParams.get("student");

  const role = session.user.role as Role;

  const visibleStudents = await prisma.student.findMany({
    where: studentVisibilityWhere(session.user.id, role),
    select: { id: true },
  });
  const studentIds = visibleStudents.map((s) => s.id);

  const tickets = await prisma.ticket.findMany({
    where: {
      studentId: { in: studentIds },
      archivedAt: null,
      ...(studentFilter ? { studentId: studentFilter } : {}),
    },
    include: {
      assignee: { select: { id: true, name: true, image: true, color: true } },
      student: { select: { id: true, fullName: true, alias: true, color: true } },
      tags: true,
      _count: { select: { comments: true } },
    },
    orderBy: [{ status: "asc" }, { order: "asc" }, { createdAt: "desc" }],
  });

  const me = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { kanbanLastSeenAt: true },
  });
  const since = me?.kanbanLastSeenAt ?? new Date(0);
  const dismissed = await getDismissedTicketIds(session.user.id);
  const recentLogs = await prisma.activityLog.findMany({
    where: {
      studentId: { in: studentIds },
      actorId: { not: session.user.id },
      action: { in: ["ticket.create", "ticket.update"] },
      createdAt: { gt: since },
      ...(dismissed.length > 0 ? { NOT: { entityId: { in: dismissed } } } : {}),
    },
    select: { entityId: true, action: true },
    orderBy: { createdAt: "asc" },
  });
  const highlightByTicket: Record<string, "new" | "updated"> = {};
  for (const l of recentLogs) {
    if (!l.entityId) continue;
    if (l.action === "ticket.create") {
      highlightByTicket[l.entityId] = "new";
    } else if (!highlightByTicket[l.entityId]) {
      highlightByTicket[l.entityId] = "updated";
    }
  }

  return NextResponse.json({
    tickets: tickets.map((t) => ({
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
    })),
    highlightByTicket,
  });
}
