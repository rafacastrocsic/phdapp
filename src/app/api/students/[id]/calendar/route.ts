import { NextResponse } from "next/server";
import { auth } from "@/auth";
import {
  accessForStudent,
  canWriteForStudent,
  type Role,
} from "@/lib/access";
import {
  createSharedCalendarForStudent,
  syncCalendarAcl,
} from "@/lib/calendar-provisioning";

/**
 * Create a shared Google calendar for the student (if missing) OR re-sync the
 * sharing ACL on the existing one. The acting user's Google account owns the
 * new calendar; the student + co-supervisors get writer access.
 *
 * Allowed callers:
 *   - the student themselves   (so they can self-provision)
 *   - the student's supervisor / co-sup (NOT team-advisor; that's read-only)
 *   - admin                    (can manage any student)
 *
 * The acting user's Google client is used for the calendar/ACL operations,
 * so the calendar ends up in their Google account. For re-syncs, the caller
 * has to be either the calendar's existing owner (so cal.acl.insert is
 * accepted) or a user whose token Google will accept for ACL changes.
 */
export async function POST(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "unauth" }, { status: 401 });
  const { id } = await params;

  const access = await accessForStudent(id, session.user.id, session.user.role as Role);
  if (!canWriteForStudent(access))
    return NextResponse.json(
      {
        error:
          "Only the student, their supervisor team, or an admin can create or share this calendar.",
      },
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
