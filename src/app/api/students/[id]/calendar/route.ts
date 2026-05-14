import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { accessForStudent, type Role } from "@/lib/access";
import {
  createSharedCalendarForStudent,
  syncCalendarAcl,
} from "@/lib/calendar-provisioning";

/**
 * Create a shared Google calendar for the student (if missing) OR re-sync the
 * sharing ACL on the existing one. The supervisor's Google account owns the
 * calendar; the student + co-supervisors get writer access.
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
      { error: "Only the student can create or share their own calendar." },
      { status: 403 },
    );

  // Pick action automatically: if no calendarId, create one; otherwise sync ACL.
  const { prisma } = await import("@/lib/prisma");
  const student = await prisma.student.findUnique({
    where: { id },
    select: { calendarId: true },
  });
  if (!student) return NextResponse.json({ error: "not found" }, { status: 404 });

  const result = student.calendarId
    ? await syncCalendarAcl(id, session.user.id)
    : await createSharedCalendarForStudent(id, session.user.id);

  return NextResponse.json(result);
}
