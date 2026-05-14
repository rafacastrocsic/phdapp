import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { accessForStudent, type Role } from "@/lib/access";
import {
  createSharedDriveFolderForStudent,
  syncDriveFolderAcl,
} from "@/lib/drive-provisioning";

/**
 * Create a shared Drive folder for the student in their own Google account
 * (if missing) OR re-sync the sharing permissions on the existing one.
 *
 * Student-only: only the student themselves can create/share their folder,
 * because it lives in their Google account.
 */
export async function POST(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "unauth" }, { status: 401 });
  const { id } = await params;

  const access = await accessForStudent(id, session.user.id, session.user.role as Role);
  if (access !== "self")
    return NextResponse.json(
      { error: "Only the student can create or share their own Drive folder." },
      { status: 403 },
    );

  const { prisma } = await import("@/lib/prisma");
  const student = await prisma.student.findUnique({
    where: { id },
    select: { driveFolderId: true },
  });
  if (!student) return NextResponse.json({ error: "not found" }, { status: 404 });

  const result = student.driveFolderId
    ? await syncDriveFolderAcl(id, session.user.id)
    : await createSharedDriveFolderForStudent(id, session.user.id);

  return NextResponse.json(result);
}
