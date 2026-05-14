import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { studentVisibilityWhereAllForAdmin, type Role } from "@/lib/access";
import { getDismissedTicketIds } from "@/lib/kanban-dismissed";

/**
 * Returns kanban activity the current user hasn't seen yet:
 *  - count: how many ticket.create/update/delete events from others since last seen
 *  - ticketIds: distinct ticket ids referenced (for highlighting in the board)
 */
export async function GET() {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ count: 0, ticketIds: [] });

  const me = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { kanbanLastSeenAt: true },
  });
  const since = me?.kanbanLastSeenAt ?? new Date(0);

  // Find which students this user can see (matches kanban-page visibility)
  const visible = await prisma.student.findMany({
    where: studentVisibilityWhereAllForAdmin(session.user.id, session.user.role as Role),
    select: { id: true },
  });
  const studentIds = visible.map((s) => s.id);
  if (studentIds.length === 0) return NextResponse.json({ count: 0, ticketIds: [] });

  const dismissed = await getDismissedTicketIds(session.user.id);
  const logs = await prisma.activityLog.findMany({
    where: {
      studentId: { in: studentIds },
      actorId: { not: session.user.id },
      action: { in: ["ticket.create", "ticket.update", "ticket.delete"] },
      createdAt: { gt: since },
      ...(dismissed.length > 0 ? { NOT: { entityId: { in: dismissed } } } : {}),
    },
    select: { entityId: true, action: true },
  });

  const ticketIds = Array.from(
    new Set(logs.map((l) => l.entityId).filter((x): x is string => !!x)),
  );

  return NextResponse.json({ count: logs.length, ticketIds });
}
