import { NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { accessForStudent, canWriteForStudent, type Role } from "@/lib/access";
import { logActivity } from "@/lib/activity-log";

const Body = z.object({
  name: z.string().min(1).max(120),
  color: z.string().optional(),
  ticketIds: z.array(z.string()).min(1),
});

// Create a Task Group from selected tasks. All tasks must belong to the
// same student and the actor must be able to write that student's tasks.
export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "unauth" }, { status: 401 });

  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success)
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "bad input" },
      { status: 400 },
    );
  const { name, color, ticketIds } = parsed.data;

  const tickets = await prisma.ticket.findMany({
    where: { id: { in: ticketIds }, archivedAt: null },
    select: { id: true, studentId: true },
  });
  if (tickets.length === 0)
    return NextResponse.json({ error: "No tasks found" }, { status: 404 });

  const studentIds = [...new Set(tickets.map((t) => t.studentId))];
  if (studentIds.length > 1)
    return NextResponse.json(
      { error: "A group can only contain tasks of the same student." },
      { status: 400 },
    );
  const studentId = studentIds[0]!;

  const access = await accessForStudent(
    studentId,
    session.user.id,
    session.user.role as Role,
  );
  if (!canWriteForStudent(access))
    return NextResponse.json(
      { error: "You can't group this student's tasks." },
      { status: 403 },
    );

  const group = await prisma.taskGroup.create({
    data: {
      name: name.trim(),
      color: color || "#6366f1",
      studentId,
      createdById: session.user.id,
    },
  });
  await prisma.ticket.updateMany({
    where: { id: { in: tickets.map((t) => t.id) } },
    data: { groupId: group.id },
  });

  await logActivity({
    actorId: session.user.id,
    actorRole: session.user.role,
    studentId,
    action: "ticket.update",
    entityType: "ticket",
    entityId: tickets[0]!.id,
    summary: `grouped ${tickets.length} task${tickets.length === 1 ? "" : "s"} into “${name.trim()}”`,
  }).catch(() => {});

  return NextResponse.json({ group: { id: group.id, name: group.name } });
}
