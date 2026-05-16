import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { studentVisibilityWhereAllForAdmin, type Role } from "@/lib/access";

// Global top-bar search: students, tasks and events the viewer can see.
// (Files live in Google Drive and aren't searchable from here.)
export async function GET(req: Request) {
  const session = await auth();
  if (!session?.user)
    return NextResponse.json({ students: [], tasks: [], events: [] });

  const q = (new URL(req.url).searchParams.get("q") ?? "").trim();
  if (q.length < 2)
    return NextResponse.json({ students: [], tasks: [], events: [] });

  const role = session.user.role as Role;
  const visibility = studentVisibilityWhereAllForAdmin(session.user.id, role);

  const visible = await prisma.student.findMany({
    where: visibility,
    select: { id: true },
  });
  const studentIds = visible.map((s) => s.id);
  const like = { contains: q, mode: "insensitive" as const };

  const [students, tasks, events] = await Promise.all([
    prisma.student.findMany({
      where: {
        AND: [
          visibility,
          {
            OR: [
              { fullName: like },
              { alias: like },
              { email: like },
            ],
          },
        ],
      },
      select: { id: true, fullName: true, alias: true, color: true, email: true },
      orderBy: { fullName: "asc" },
      take: 6,
    }),
    prisma.ticket.findMany({
      where: {
        archivedAt: null,
        studentId: { in: studentIds },
        title: like,
      },
      select: {
        id: true,
        title: true,
        status: true,
        student: { select: { fullName: true, alias: true } },
      },
      orderBy: { updatedAt: "desc" },
      take: 6,
    }),
    prisma.event.findMany({
      where: {
        OR: [{ studentId: { in: studentIds } }, { studentId: null }],
        title: like,
      },
      select: { id: true, title: true, startsAt: true, ticketId: true },
      orderBy: { startsAt: "desc" },
      take: 6,
    }),
  ]);

  return NextResponse.json({
    students: students.map((s) => ({
      id: s.id,
      name: s.alias?.trim() || s.fullName,
      email: s.email,
      color: s.color,
    })),
    tasks: tasks.map((t) => ({
      id: t.id,
      title: t.title,
      status: t.status,
      student: t.student.alias?.trim() || t.student.fullName,
    })),
    events: events.map((e) => ({
      id: e.id,
      title: e.title,
      startsAt: e.startsAt.toISOString(),
      ticketId: e.ticketId,
    })),
  });
}
