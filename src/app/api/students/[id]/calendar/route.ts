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
    select: {
      calendarId: true,
      userId: true,
      supervisorId: true,
      coSupervisors: {
        where: { role: { not: "team_advisor" } },
        select: { userId: true },
      },
    },
  });
  if (!student) return NextResponse.json({ error: "not found" }, { status: 404 });

  // Creating a brand-new calendar always runs as the acting user
  // (the calendar will live in their Google account).
  if (!student.calendarId) {
    const result = await createSharedCalendarForStudent(id, session.user.id);
    return NextResponse.json(result);
  }

  // Re-syncing ACL on an existing calendar requires the OWNER's
  // Google token — only the owner can call acl.insert (Google
  // returns 403 Forbidden for everyone else, even writers). The
  // acting user is the most likely owner, but if they aren't, fall
  // through a chain of plausible owners until one succeeds:
  //   acting user → primary supervisor → each non-team-advisor
  //   co-supervisor → the student themselves
  // Duplicates are deduped so we never try the same user twice.
  const candidates: string[] = [];
  const seen = new Set<string>();
  function add(uid: string | null | undefined) {
    if (!uid) return;
    if (seen.has(uid)) return;
    seen.add(uid);
    candidates.push(uid);
  }
  add(session.user.id);
  add(student.supervisorId);
  for (const cs of student.coSupervisors) add(cs.userId);
  add(student.userId);

  const attempts: Array<{
    userId: string;
    ok: boolean;
    shared: number;
    autoAdded: number;
    failed: { email: string; error: string }[];
    warning?: string;
  }> = [];
  for (const uid of candidates) {
    const r = await syncCalendarAcl(id, uid);
    attempts.push({
      userId: uid,
      ok: r.ok,
      shared: r.shared,
      autoAdded: r.autoAdded,
      failed: r.failed,
      warning: r.warning,
    });
    // Success criterion: at least one ACL grant landed AND no
    // failures recorded. "shared > 0" alone isn't enough — a
    // non-owner can sometimes get past 0 failures by hitting all
    // 409s, but if there are real failures we want to keep trying.
    if (r.ok) return NextResponse.json(r);
  }

  // Nobody could complete the sync cleanly. Return the last attempt
  // along with a helpful summary so the caller knows which accounts
  // we tried.
  const tried = await prisma.user.findMany({
    where: { id: { in: candidates } },
    select: { id: true, name: true, email: true },
  });
  const triedNames = candidates
    .map((id) => {
      const u = tried.find((t) => t.id === id);
      return u?.name ?? u?.email ?? "unknown user";
    })
    .join(", ");
  const last = attempts[attempts.length - 1];
  return NextResponse.json({
    ...last,
    warning:
      `None of the tried Google accounts owns this calendar, so the ACL couldn't be updated. ` +
      `Tried: ${triedNames}. ` +
      `Sign in as the calendar's actual owner and click Sync sharing again — or share the calendar manually from calendar.google.com.`,
  });
}
