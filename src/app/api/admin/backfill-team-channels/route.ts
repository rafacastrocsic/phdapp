import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { isAdmin } from "@/lib/access";
import { ensureTeamChannel } from "@/lib/team-channel";

// Admin-only: make sure every student has a general team channel.
// Idempotent — students that already have a channel are skipped.
export async function POST() {
  const session = await auth();
  if (!session?.user)
    return NextResponse.json({ error: "unauth" }, { status: 401 });
  if (!isAdmin(session.user.role))
    return NextResponse.json({ error: "Admin only" }, { status: 403 });

  const students = await prisma.student.findMany({ select: { id: true } });
  let created = 0;
  for (const s of students) {
    const before = await prisma.channel.count({
      where: { studentId: s.id },
    });
    if (before > 0) continue;
    const id = await ensureTeamChannel(s.id);
    if (id) created += 1;
  }
  return NextResponse.json({ scanned: students.length, created });
}
