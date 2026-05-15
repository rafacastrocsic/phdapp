import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import {
  studentVisibilityWhere,
  teamLevelForStudent,
  type Role,
} from "@/lib/access";
import { ReadingView } from "./reading-view";

export default async function ReadingPage({
  searchParams,
}: {
  searchParams: Promise<{ student?: string }>;
}) {
  const sp = await searchParams;
  const session = (await auth())!;
  const role = session.user.role as Role;

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
      ...(sp.student ? { studentId: sp.student } : {}),
    },
    orderBy: [{ createdAt: "desc" }],
    include: {
      addedBy: authorSel,
      decisionBy: authorSel,
      student: { select: { id: true, fullName: true, alias: true, color: true } },
    },
  });

  return (
    <ReadingView
      viewerRole={role}
      students={students}
      levelByStudent={levelByStudent}
      initialStudent={sp.student ?? null}
      initialItems={items.map((i) => ({
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
      }))}
    />
  );
}
