import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { studentVisibilityWhere, type Role } from "@/lib/access";
import { FilesBrowser } from "./files-browser";

export default async function FilesPage({
  searchParams,
}: {
  searchParams: Promise<{ student?: string; folder?: string }>;
}) {
  const sp = await searchParams;
  const session = (await auth())!;
  const role = session.user.role as Role;

  const students = await prisma.student.findMany({
    where: studentVisibilityWhere(session.user.id, role),
    select: { id: true, fullName: true, alias: true, color: true, driveFolderId: true },
    orderBy: { fullName: "asc" },
  });

  // For student-role viewers, their own student id so the page can show the
  // "create shared Drive folder" CTA when they're the active student.
  const viewerStudent =
    role === "student"
      ? await prisma.student.findFirst({
          where: { userId: session.user.id },
          select: { id: true },
        })
      : null;

  return (
    <FilesBrowser
      students={students}
      initialStudentId={sp.student ?? null}
      initialFolderId={sp.folder ?? null}
      viewerStudentId={viewerStudent?.id ?? null}
    />
  );
}
