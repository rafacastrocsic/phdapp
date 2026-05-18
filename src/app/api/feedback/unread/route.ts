import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { isAdmin, type Role } from "@/lib/access";

// Sidebar bubble for the Feedback entry.
//  - Admins: new submissions (by others) since they last opened /feedback.
//  - Everyone else: their own items that got an admin reply since then.
export async function GET() {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ count: 0 });

  const me = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { feedbackLastSeenAt: true },
  });
  const since = me?.feedbackLastSeenAt ?? new Date(0);

  let count: number;
  if (isAdmin(session.user.role as Role)) {
    count = await prisma.feedback.count({
      where: {
        authorId: { not: session.user.id },
        createdAt: { gt: since },
      },
    });
  } else {
    count = await prisma.feedback.count({
      where: {
        authorId: session.user.id,
        repliedAt: { gt: since },
      },
    });
  }
  return NextResponse.json({ count });
}
