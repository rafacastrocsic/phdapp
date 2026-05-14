import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";

/**
 * Mark the channel as read up to "now" for the calling user.
 * Creates a ChannelMember row if one doesn't exist yet (e.g. supervisor
 * viewing a student channel they were never explicitly added to).
 */
export async function POST(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "unauth" }, { status: 401 });
  const { id } = await params;

  const existing = await prisma.channelMember.findFirst({
    where: { channelId: id, userId: session.user.id },
    select: { id: true },
  });
  if (existing) {
    await prisma.channelMember.update({
      where: { id: existing.id },
      data: { lastRead: new Date() },
    });
  } else {
    // Verify the channel exists / is accessible before creating a membership.
    const channel = await prisma.channel.findUnique({
      where: { id },
      select: { id: true },
    });
    if (!channel) return NextResponse.json({ error: "not found" }, { status: 404 });
    await prisma.channelMember.create({
      data: {
        channelId: id,
        userId: session.user.id,
        lastRead: new Date(),
      },
    });
  }
  return NextResponse.json({ ok: true });
}
