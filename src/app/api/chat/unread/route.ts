import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { computeUnreadByChannel } from "@/lib/chat-access";

export async function GET() {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ count: 0, byChannel: {} });
  const userId = session.user.id;
  const { total, byChannel } = await computeUnreadByChannel(userId);

  // Name of whoever sent the most recent still-unread message, for the
  // browser-tab title ("X messaged you").
  let latestSender: string | null = null;
  if (total > 0) {
    const unreadChannelIds = Object.keys(byChannel).filter(
      (id) => byChannel[id] > 0,
    );
    if (unreadChannelIds.length > 0) {
      const memberships = await prisma.channelMember.findMany({
        where: { userId, channelId: { in: unreadChannelIds } },
        select: { channelId: true, lastRead: true },
      });
      const lastRead = new Map(
        memberships.map((m) => [m.channelId, m.lastRead]),
      );
      const msg = await prisma.message.findFirst({
        where: {
          channelId: { in: unreadChannelIds },
          authorId: { not: userId },
        },
        orderBy: { createdAt: "desc" },
        select: {
          createdAt: true,
          channelId: true,
          author: { select: { name: true } },
        },
      });
      if (
        msg &&
        msg.createdAt > (lastRead.get(msg.channelId) ?? new Date(0))
      )
        latestSender = msg.author?.name ?? null;
    }
  }

  return NextResponse.json({ count: total, byChannel, latestSender });
}
