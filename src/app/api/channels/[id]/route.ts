import { NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";

async function callerIsMember(channelId: string, userId: string) {
  const m = await prisma.channelMember.findFirst({
    where: { channelId, userId },
    select: { id: true },
  });
  return !!m;
}

const Patch = z.object({
  name: z.string().min(1).optional(),
  description: z.string().nullable().optional(),
  color: z.string().optional(),
  // Full replacement of the channel's member set.
  memberIds: z.array(z.string()).optional(),
});

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "unauth" }, { status: 401 });
  const { id } = await params;

  const channel = await prisma.channel.findUnique({ where: { id } });
  if (!channel) return NextResponse.json({ error: "not found" }, { status: 404 });

  // Rename allowed for admin OR any member of the channel.
  const allowed =
    session.user.role === "admin" || (await callerIsMember(id, session.user.id));
  if (!allowed)
    return NextResponse.json(
      { error: "Only members of this channel can edit it" },
      { status: 403 },
    );

  const json = await req.json().catch(() => null);
  const parsed = Patch.safeParse(json);
  if (!parsed.success) return NextResponse.json({ error: "bad input" }, { status: 400 });
  const d = parsed.data;

  const data: Record<string, unknown> = {};
  if (d.name !== undefined) data.name = d.name;
  if (d.description !== undefined) data.description = d.description;
  if (d.color !== undefined) data.color = d.color;
  if (Object.keys(data).length > 0)
    await prisma.channel.update({ where: { id }, data });

  // Replace the member set if provided (dedup; keep only real users).
  if (d.memberIds !== undefined) {
    const wanted = Array.from(new Set(d.memberIds));
    const users = await prisma.user.findMany({
      where: { id: { in: wanted } },
      select: { id: true },
    });
    const validIds = users.map((u) => u.id);
    await prisma.channelMember.deleteMany({ where: { channelId: id } });
    if (validIds.length > 0)
      await prisma.channelMember.createMany({
        data: validIds.map((userId) => ({ channelId: id, userId })),
        skipDuplicates: true,
      });
  }

  return NextResponse.json({ ok: true });
}

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "unauth" }, { status: 401 });
  const { id } = await params;

  const channel = await prisma.channel.findUnique({ where: { id } });
  if (!channel) return NextResponse.json({ error: "not found" }, { status: 404 });

  // Delete allowed for admin OR supervisors who are members. Students can't delete.
  if (session.user.role === "student")
    return NextResponse.json({ error: "Students cannot delete channels" }, { status: 403 });

  const allowed =
    session.user.role === "admin" || (await callerIsMember(id, session.user.id));
  if (!allowed)
    return NextResponse.json(
      { error: "Only supervisors who are members of this channel can delete it" },
      { status: 403 },
    );

  await prisma.channel.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}
