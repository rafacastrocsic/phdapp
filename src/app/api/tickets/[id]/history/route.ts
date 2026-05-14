import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { studentVisibilityWhereAllForAdmin, type Role } from "@/lib/access";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "unauth" }, { status: 401 });
  const { id } = await params;

  // Caller must be allowed to see this ticket's student.
  const ticket = await prisma.ticket.findFirst({
    where: {
      id,
      student: studentVisibilityWhereAllForAdmin(session.user.id, session.user.role as Role),
    },
    select: { id: true, createdAt: true, createdById: true, createdBy: { select: { name: true, email: true, color: true, image: true } } },
  });
  if (!ticket) return NextResponse.json({ error: "not found" }, { status: 404 });

  const logs = await prisma.activityLog.findMany({
    where: {
      entityType: "ticket",
      entityId: id,
    },
    include: {
      actor: { select: { id: true, name: true, email: true, image: true, color: true } },
    },
    orderBy: { createdAt: "desc" },
    take: 100,
  });

  return NextResponse.json({
    entries: logs.map((l) => ({
      id: l.id,
      action: l.action,
      summary: l.summary,
      details: l.details,
      createdAt: l.createdAt.toISOString(),
      actor: l.actor,
      actorRoleAtTime: l.actorRoleAtTime,
    })),
    // Include the "created" fact in case it predates the ActivityLog system.
    creation: {
      createdAt: ticket.createdAt.toISOString(),
      createdBy: ticket.createdBy,
    },
  });
}
