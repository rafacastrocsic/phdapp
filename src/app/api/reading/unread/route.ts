import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { studentVisibilityWhereAllForAdmin, type Role } from "@/lib/access";

export async function GET() {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ count: 0 });

  const me = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { readingLastSeenAt: true },
  });
  const since = me?.readingLastSeenAt ?? new Date(0);

  const visible = await prisma.student.findMany({
    where: studentVisibilityWhereAllForAdmin(
      session.user.id,
      session.user.role as Role,
    ),
    select: { id: true },
  });
  const studentIds = visible.map((s) => s.id);
  if (studentIds.length === 0) return NextResponse.json({ count: 0 });

  const count = await prisma.activityLog.count({
    where: {
      studentId: { in: studentIds },
      actorId: { not: session.user.id },
      action: {
        in: [
          "reading.create",
          "reading.propose",
          "reading.decision",
          "reading.delete",
        ],
      },
      createdAt: { gt: since },
    },
  });
  return NextResponse.json({ count });
}
