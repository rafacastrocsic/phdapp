import { NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { accessForStudent, canWriteForStudent, type Role } from "@/lib/access";
import { logActivity } from "@/lib/activity-log";

const Body = z.object({
  items: z
    .array(
      z.object({
        text: z.string().min(1),
        assigneeId: z.string().nullable().optional(),
        dueDate: z.string().nullable().optional(),
        priority: z.string().optional(),
        category: z.string().optional(),
      }),
    )
    .min(1),
});

// Turn meeting action items into Tasks for the meeting's student.
export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "unauth" }, { status: 401 });
  const { id } = await params;

  const event = await prisma.event.findUnique({
    where: { id },
    select: { id: true, studentId: true, title: true },
  });
  if (!event || !event.studentId)
    return NextResponse.json(
      { error: "Meeting must be linked to a student to create tasks" },
      { status: 400 },
    );

  const access = await accessForStudent(
    event.studentId,
    session.user.id,
    session.user.role as Role,
  );
  if (!canWriteForStudent(access))
    return NextResponse.json({ error: "forbidden" }, { status: 403 });

  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success)
    return NextResponse.json({ error: "bad input" }, { status: 400 });

  const created = [];
  for (const it of parsed.data.items) {
    const t = await prisma.ticket.create({
      data: {
        title: it.text,
        studentId: event.studentId,
        assigneeId: it.assigneeId || null,
        status: "todo",
        priority: it.priority || "medium",
        category: it.category || "meeting",
        dueDate: it.dueDate ? new Date(it.dueDate) : null,
        createdById: session.user.id,
      },
    });
    created.push(t.id);
    await logActivity({
      actorId: session.user.id,
      actorRole: session.user.role,
      studentId: event.studentId,
      action: "ticket.create",
      entityType: "ticket",
      entityId: t.id,
      summary: `created task “${it.text}” from meeting “${event.title}”`,
    });
  }
  return NextResponse.json({ created });
}
