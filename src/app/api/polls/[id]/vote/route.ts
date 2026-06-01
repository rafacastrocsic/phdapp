import { NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";

// Toggle the viewer's vote on an option.
//   - If they already voted for this option → remove the vote.
//   - Otherwise → add their vote. For SINGLE-vote polls this also
//     removes any vote they had on a different option in the same
//     poll (so the UI feels like a radio).
//   - Rejected if the poll is closed (closedAt set) or past the
//     closesAt cutoff.
const Body = z.object({
  optionId: z.string(),
});

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await auth();
  if (!session?.user)
    return NextResponse.json({ error: "unauth" }, { status: 401 });
  const { id } = await params;

  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success)
    return NextResponse.json({ error: "bad input" }, { status: 400 });

  // Load the poll, the requested option, and the channel-membership
  // context all at once so we can authorize in a single round-trip.
  const poll = await prisma.poll.findUnique({
    where: { id },
    include: {
      message: {
        select: {
          channel: {
            select: {
              kind: true,
              members: {
                where: { userId: session.user.id },
                select: { id: true },
              },
              student: {
                select: {
                  supervisorId: true,
                  userId: true,
                  coSupervisors: {
                    where: {
                      userId: session.user.id,
                      role: { not: "team_advisor" },
                    },
                    select: { id: true },
                  },
                },
              },
            },
          },
        },
      },
      options: { select: { id: true } },
    },
  });
  if (!poll)
    return NextResponse.json({ error: "not found" }, { status: 404 });

  const ch = poll.message.channel;
  const canVote =
    ch.members.length > 0 ||
    ch.kind === "general" ||
    ch.student?.supervisorId === session.user.id ||
    (ch.student?.coSupervisors.length ?? 0) > 0 ||
    ch.student?.userId === session.user.id;
  if (!canVote)
    return NextResponse.json({ error: "forbidden" }, { status: 403 });

  if (poll.closedAt || (poll.closesAt && poll.closesAt <= new Date()))
    return NextResponse.json(
      { error: "This poll is closed." },
      { status: 409 },
    );

  // The option must belong to this poll.
  if (!poll.options.some((o) => o.id === parsed.data.optionId))
    return NextResponse.json(
      { error: "That option doesn't belong to this poll." },
      { status: 400 },
    );

  const existing = await prisma.pollVote.findUnique({
    where: {
      optionId_userId: {
        optionId: parsed.data.optionId,
        userId: session.user.id,
      },
    },
    select: { id: true },
  });

  if (existing) {
    // Already voted for this option → toggle OFF.
    await prisma.pollVote.delete({ where: { id: existing.id } });
  } else {
    // Casting a new vote. For single-vote polls, first remove any
    // existing vote by this user on a different option of THIS poll
    // so the radio behavior holds.
    if (!poll.multiVote) {
      const optionIds = poll.options.map((o) => o.id);
      await prisma.pollVote.deleteMany({
        where: { userId: session.user.id, optionId: { in: optionIds } },
      });
    }
    await prisma.pollVote.create({
      data: { optionId: parsed.data.optionId, userId: session.user.id },
    });
  }

  // Return the fresh poll state — the client can splice it into the
  // message it lives on without re-fetching the whole thread.
  const fresh = await prisma.poll.findUnique({
    where: { id },
    include: {
      options: {
        orderBy: { order: "asc" },
        include: {
          votes: {
            include: {
              user: {
                select: { id: true, name: true, image: true, color: true },
              },
            },
          },
        },
      },
    },
  });
  if (!fresh) return NextResponse.json({ ok: true });
  return NextResponse.json({
    poll: {
      id: fresh.id,
      question: fresh.question,
      multiVote: fresh.multiVote,
      closesAt: fresh.closesAt?.toISOString() ?? null,
      closedAt: fresh.closedAt?.toISOString() ?? null,
      createdById: fresh.createdById,
      options: fresh.options.map((o) => ({
        id: o.id,
        text: o.text,
        order: o.order,
        votes: o.votes.map((v) => ({
          userId: v.user.id,
          name: v.user.name,
          image: v.user.image,
          color: v.user.color,
        })),
      })),
    },
  });
}
