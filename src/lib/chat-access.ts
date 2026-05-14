import { prisma } from "./prisma";

/**
 * Returns all channels visible to a user — mirrors the chat-page listing logic:
 *  - channels they are a member of
 *  - channels for students they can see (supervised/co-supervised/are)
 *  - general channels
 */
export async function visibleChannelIdsForUser(userId: string): Promise<string[]> {
  const channels = await prisma.channel.findMany({
    where: {
      OR: [
        { members: { some: { userId } } },
        { student: { supervisorId: userId } },
        { student: { coSupervisors: { some: { userId } } } },
        { student: { userId } },
        { kind: "general" },
      ],
    },
    select: { id: true },
  });
  return channels.map((c) => c.id);
}

/**
 * Compute unread message counts per visible channel for the given user.
 * For channels with a ChannelMember row, uses `lastRead`. For channels with
 * no membership row (e.g. supervisor accessing a student channel they never
 * joined), counts every message from someone else.
 *
 * Returns a map of channelId -> count, plus the total across all channels.
 */
export async function computeUnreadByChannel(userId: string): Promise<{
  total: number;
  byChannel: Record<string, number>;
}> {
  const channelIds = await visibleChannelIdsForUser(userId);
  if (channelIds.length === 0) return { total: 0, byChannel: {} };

  const memberships = await prisma.channelMember.findMany({
    where: { userId, channelId: { in: channelIds } },
    select: { channelId: true, lastRead: true },
  });
  const lastReadByChannel = new Map<string, Date>(
    memberships.map((m) => [m.channelId, m.lastRead]),
  );

  const byChannel: Record<string, number> = {};
  let total = 0;
  for (const channelId of channelIds) {
    const since = lastReadByChannel.get(channelId) ?? new Date(0);
    const n = await prisma.message.count({
      where: {
        channelId,
        createdAt: { gt: since },
        authorId: { not: userId },
      },
    });
    byChannel[channelId] = n;
    total += n;
  }
  return { total, byChannel };
}
