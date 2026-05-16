import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import {
  studentVisibilityWhere,
  teamLevelForStudent,
  type Role,
} from "@/lib/access";

// Polled by ReadingView so approvals / new items / status changes by others
// show up without a manual reload.
export async function GET(req: Request) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "unauth" }, { status: 401 });
  const role = session.user.role as Role;
  const studentFilter = new URL(req.url).searchParams.get("student");

  const students = await prisma.student.findMany({
    where: studentVisibilityWhere(session.user.id, role),
    select: { id: true, fullName: true, alias: true, color: true },
    orderBy: { fullName: "asc" },
  });
  const studentIds = students.map((s) => s.id);

  const levelByStudent: Record<string, string> = {};
  for (const s of students) {
    levelByStudent[s.id] =
      (await teamLevelForStudent(s.id, session.user.id, role)) ?? "committee";
  }

  const authorSel = {
    select: { id: true, name: true, image: true, color: true },
  };
  const items = await prisma.readingItem.findMany({
    where: {
      studentId: { in: studentIds },
      ...(studentFilter ? { studentId: studentFilter } : {}),
    },
    orderBy: [{ createdAt: "desc" }],
    include: {
      addedBy: authorSel,
      decisionBy: authorSel,
      student: { select: { id: true, fullName: true, alias: true, color: true } },
    },
  });

  return NextResponse.json({
    students,
    levelByStudent,
    items: items.map((i) => ({
      id: i.id,
      studentId: i.studentId,
      student: i.student,
      title: i.title,
      authors: i.authors,
      url: i.url,
      status: i.status,
      proposedByStudent: i.proposedByStudent,
      decisionNote: i.decisionNote,
      addedBy: i.addedBy,
      createdAt: i.createdAt.toISOString(),
    })),
  });
}
