import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { isAdmin, type Role } from "@/lib/access";

// Sidebar bubble for the Feedback entry.
//  - Admins: new submissions and new submitter messages (since last open).
//  - Everyone else: their own items that got an admin reply, plus any
//    new admin message in their threads, since last open.
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
    // New submissions by others + new thread replies by anyone-but-me.
    const [newSubs, newReplies] = await Promise.all([
      prisma.feedback.count({
        where: {
          authorId: { not: session.user.id },
          createdAt: { gt: since },
        },
      }),
      prisma.feedbackMessage.count({
        where: {
          authorId: { not: session.user.id },
          createdAt: { gt: since },
        },
      }),
    ]);
    count = newSubs + newReplies;
  } else {
    const [withLegacyReply, withNewMessage] = await Promise.all([
      prisma.feedback.count({
        where: { authorId: session.user.id, repliedAt: { gt: since } },
      }),
      prisma.feedbackMessage.count({
        where: {
          authorId: { not: session.user.id },
          createdAt: { gt: since },
          feedback: { authorId: session.user.id },
        },
      }),
    ]);
    count = withLegacyReply + withNewMessage;
  }
  return NextResponse.json({ count });
}
