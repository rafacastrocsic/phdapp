import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import {
  accessForStudent,
  canWriteForStudent,
  studentVisibilityWhereAllForAdmin,
  type Role,
} from "@/lib/access";
import { logActivity } from "@/lib/activity-log";

// Undo a soft-deleted task (§14).
export async function POST(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "unauth" }, { status: 401 });
  const { id } = await params;

  const t = await prisma.ticket.findFirst({
    where: {
      id,
      student: studentVisibilityWhereAllForAdmin(
        session.user.id,
        session.user.role as Role,
      ),
    },
    select: { id: true, studentId: true, title: true, dueDate: true },
  });
  if (!t) return NextResponse.json({ error: "not found" }, { status: 404 });

  const access = await accessForStudent(
    t.studentId,
    session.user.id,
    session.user.role as Role,
  );
  if (!canWriteForStudent(access))
    return NextResponse.json({ error: "forbidden" }, { status: 403 });

  await prisma.ticket.update({ where: { id }, data: { archivedAt: null } });

  // Re-create the calendar mirror if it had a due date.
  if (t.dueDate) {
    const { syncTaskDueEvent } = await import("@/lib/task-event-sync");
    await syncTaskDueEvent(id, session.user.id).catch(() => {});
  }

  await logActivity({
    actorId: session.user.id,
    actorRole: session.user.role,
    studentId: t.studentId,
    action: "ticket.update",
    entityType: "ticket",
    entityId: id,
    summary: `restored task “${t.title}”`,
  });

  return NextResponse.json({ ok: true });
}
