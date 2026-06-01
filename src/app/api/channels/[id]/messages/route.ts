import { NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";

async function authorize(channelId: string, userId: string) {
  // member, supervisor of linked student, or general channel
  const c = await prisma.channel.findFirst({
    where: {
      id: channelId,
      OR: [
        { members: { some: { userId } } },
        { kind: "general" },
        { student: { supervisorId: userId } },
        // team_advisor is read-only — no implicit chat via the team link
        // (still allowed if explicitly added as a channel member above).
        {
          student: {
            coSupervisors: {
              some: { userId, role: { not: "team_advisor" } },
            },
          },
        },
        { student: { userId } },
      ],
    },
    select: { id: true },
  });
  return !!c;
}

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "unauth" }, { status: 401 });
  const { id } = await params;
  if (!(await authorize(id, session.user.id)))
    return NextResponse.json({ error: "forbidden" }, { status: 403 });

  const messages = await prisma.message.findMany({
    where: { channelId: id },
    include: {
      author: { select: { id: true, name: true, image: true, color: true } },
      replyTo: {
        select: {
          id: true,
          body: true,
          author: { select: { name: true } },
        },
      },
      poll: {
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
      },
    },
    orderBy: { createdAt: "asc" },
    take: 200,
  });

  // Read receipts: each channel member + how far they've read (lastRead).
  const reads = await prisma.channelMember.findMany({
    where: { channelId: id },
    select: {
      userId: true,
      lastRead: true,
      user: { select: { name: true, image: true, color: true } },
    },
  });

  return NextResponse.json({
    messages: messages.map((m) => ({
      id: m.id,
      body: m.body,
      createdAt: m.createdAt.toISOString(),
      editedAt: m.editedAt ? m.editedAt.toISOString() : null,
      author: m.author,
      attachments: parseAttachments(m.attachments),
      replyTo: m.replyTo
        ? {
            id: m.replyTo.id,
            body: m.replyTo.body,
            authorName: m.replyTo.author?.name ?? null,
          }
        : null,
      poll: serializePoll(m.poll),
    })),
    reads: reads.map((r) => ({
      userId: r.userId,
      name: r.user.name,
      image: r.user.image,
      color: r.user.color,
      lastRead: r.lastRead.toISOString(),
    })),
  });
}

// Shape used by both GET (list) and POST (create). The vote-shape on
// each option carries the FULL voter list — non-anonymous polls, so
// the client renders avatars under each option.
interface SerializedPoll {
  id: string;
  question: string;
  multiVote: boolean;
  closesAt: string | null;
  closedAt: string | null;
  createdById: string;
  options: {
    id: string;
    text: string;
    order: number;
    votes: {
      userId: string;
      name: string | null;
      image: string | null;
      color: string;
    }[];
  }[];
}
function serializePoll(
  poll:
    | (NonNullable<unknown> & {
        id: string;
        question: string;
        multiVote: boolean;
        closesAt: Date | null;
        closedAt: Date | null;
        createdById: string;
        options: {
          id: string;
          text: string;
          order: number;
          votes: {
            user: { id: string; name: string | null; image: string | null; color: string };
          }[];
        }[];
      })
    | null,
): SerializedPoll | null {
  if (!poll) return null;
  return {
    id: poll.id,
    question: poll.question,
    multiVote: poll.multiVote,
    closesAt: poll.closesAt?.toISOString() ?? null,
    closedAt: poll.closedAt?.toISOString() ?? null,
    createdById: poll.createdById,
    options: poll.options.map((o) => ({
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
  };
}

interface Attachment {
  name: string;
  url: string;
  mimeType: string;
  size: number;
}

function parseAttachments(raw: string | null): Attachment[] {
  if (!raw) return [];
  try {
    const arr = JSON.parse(raw);
    return Array.isArray(arr) ? (arr as Attachment[]) : [];
  } catch {
    return [];
  }
}

const PollIn = z.object({
  question: z.string().min(1).max(300),
  options: z
    .array(z.string().min(1).max(120))
    .min(2, "A poll needs at least 2 options")
    .max(10, "A poll caps at 10 options"),
  multiVote: z.boolean().default(false),
  closesAt: z.string().datetime().optional().nullable(),
});

const Body = z
  .object({
    body: z.string().default(""),
    attachments: z
      .array(
        z.object({
          name: z.string(),
          url: z.string(),
          mimeType: z.string(),
          size: z.number().int().nonnegative(),
        }),
      )
      .optional(),
    replyToId: z.string().optional().nullable(),
    poll: PollIn.optional(),
  })
  .refine(
    (d) =>
      (d.body && d.body.trim().length > 0) ||
      (d.attachments && d.attachments.length > 0) ||
      !!d.poll,
    {
      message: "Need a message body, attachment, or poll",
    },
  );

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "unauth" }, { status: 401 });
  const { id } = await params;
  if (!(await authorize(id, session.user.id)))
    return NextResponse.json({ error: "forbidden" }, { status: 403 });

  const json = await req.json().catch(() => null);
  const parsed = Body.safeParse(json);
  if (!parsed.success)
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "bad input" },
      { status: 400 },
    );

  const attachments = parsed.data.attachments ?? [];
  // Only honour replyToId if it points at a message in THIS channel.
  let replyToId: string | null = null;
  if (parsed.data.replyToId) {
    const parent = await prisma.message.findFirst({
      where: { id: parsed.data.replyToId, channelId: id },
      select: { id: true },
    });
    replyToId = parent?.id ?? null;
  }
  const m = await prisma.message.create({
    data: {
      channelId: id,
      authorId: session.user.id,
      body: parsed.data.body ?? "",
      attachments: attachments.length > 0 ? JSON.stringify(attachments) : null,
      replyToId,
      // Polls are created atomically with the message so the
      // attachment can never end up orphaned (message exists but no
      // poll, or vice versa). Dedupe identical option strings to
      // prevent two "Tuesday" rows showing as separate options.
      poll: parsed.data.poll
        ? {
            create: {
              question: parsed.data.poll.question.trim(),
              multiVote: parsed.data.poll.multiVote,
              closesAt: parsed.data.poll.closesAt
                ? new Date(parsed.data.poll.closesAt)
                : null,
              createdById: session.user.id,
              options: {
                create: Array.from(
                  new Map(
                    parsed.data.poll.options
                      .map((t) => t.trim())
                      .filter((t) => t.length > 0)
                      .map((t, i) => [t.toLowerCase(), { text: t, order: i }]),
                  ).values(),
                ),
              },
            },
          }
        : undefined,
    },
    include: {
      author: { select: { id: true, name: true, image: true, color: true } },
      replyTo: {
        select: {
          id: true,
          body: true,
          author: { select: { name: true } },
        },
      },
      poll: {
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
      },
    },
  });
  await prisma.channel.update({
    where: { id },
    data: { updatedAt: new Date() },
  });
  // Sender has obviously read everything before their own message.
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
    await prisma.channelMember.create({
      data: { channelId: id, userId: session.user.id, lastRead: new Date() },
    });
  }
  return NextResponse.json({
    message: {
      id: m.id,
      body: m.body,
      createdAt: m.createdAt.toISOString(),
      editedAt: m.editedAt ? m.editedAt.toISOString() : null,
      author: m.author,
      attachments,
      replyTo: m.replyTo
        ? {
            id: m.replyTo.id,
            body: m.replyTo.body,
            authorName: m.replyTo.author?.name ?? null,
          }
        : null,
      poll: serializePoll(m.poll),
    },
  });
}
