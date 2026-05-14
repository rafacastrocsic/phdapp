import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import {
  accessForStudent,
  canEditStudentProfile,
  type Role,
} from "@/lib/access";
import { logActivity } from "@/lib/activity-log";

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string; fileId: string }> },
) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "unauth" }, { status: 401 });

  const { id, fileId } = await params;
  const access = await accessForStudent(id, session.user.id, session.user.role as Role);
  if (!canEditStudentProfile(access))
    return NextResponse.json(
      { error: "You don't have permission to manage this student's favorites" },
      { status: 403 },
    );

  // fileId is the Drive file id (so the client can call delete without first GETting the row)
  const existing = await prisma.favoriteFile.findFirst({
    where: { studentId: id, driveFileId: fileId },
  });
  if (!existing) return NextResponse.json({ ok: true });
  await prisma.favoriteFile.delete({ where: { id: existing.id } });

  await logActivity({
    actorId: session.user.id,
    actorRole: session.user.role,
    studentId: id,
    action: "favorite.remove",
    entityType: "file",
    entityId: fileId,
    summary: `un-starred “${existing.name}”`,
  });
  return NextResponse.json({ ok: true });
}
