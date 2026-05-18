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
    include: { author: { select: { id: true, name: true, image: true, color: true } } },
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
      author: m.author,
      attachments: parseAttachments(m.attachments),
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
  })
  .refine((d) => (d.body && d.body.trim().length > 0) || (d.attachments && d.attachments.length > 0), {
    message: "Need a message body or at least one attachment",
  });

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
  const m = await prisma.message.create({
    data: {
      channelId: id,
      authorId: session.user.id,
      body: parsed.data.body ?? "",
      attachments: attachments.length > 0 ? JSON.stringify(attachments) : null,
    },
    include: { author: { select: { id: true, name: true, image: true, color: true } } },
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
      author: m.author,
      attachments,
    },
  });
}
