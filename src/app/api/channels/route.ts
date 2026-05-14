import { NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";

const Body = z.object({
  name: z.string().min(1),
  kind: z.string().default("cosupervisors"),
  studentId: z.string().optional(),
  memberIds: z.string().optional(), // JSON-encoded
});

export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "unauth" }, { status: 401 });

  const json = await req.json().catch(() => null);
  const parsed = Body.safeParse(json);
  if (!parsed.success) return NextResponse.json({ error: "bad input" }, { status: 400 });
  const d = parsed.data;

  // If a student is linked, only one of that student's supervisors, OR the
  // student themselves, can create a channel about them.
  if (d.studentId) {
    const allowed = await prisma.student.findFirst({
      where: {
        id: d.studentId,
        OR: [
          { supervisorId: session.user.id },
          { coSupervisors: { some: { userId: session.user.id } } },
          { userId: session.user.id },
        ],
      },
      select: { id: true },
    });
    if (!allowed)
      return NextResponse.json(
        { error: "You can only create channels about students you are linked to" },
        { status: 403 },
      );
  }

  const colorByKind: Record<string, string> = {
    cosupervisors: "#00d1c1",
    student: "#ec4899",
    direct: "#6f4cff",
    general: "#ffcc4d",
  };

  const memberIds: string[] = JSON.parse(d.memberIds ?? "[]");
  const allMemberIds = Array.from(new Set([session.user.id, ...memberIds]));

  const channel = await prisma.channel.create({
    data: {
      name: d.name,
      kind: d.kind,
      color: colorByKind[d.kind] ?? "#6f4cff",
      studentId: d.studentId || null,
      members: {
        create: allMemberIds.map((id) => ({ userId: id })),
      },
    },
    include: {
      student: { select: { id: true, fullName: true, alias: true, color: true } },
      members: {
        include: { user: { select: { id: true, name: true, image: true, color: true } } },
      },
    },
  });

  return NextResponse.json({
    channel: {
      id: channel.id,
      name: channel.name,
      kind: channel.kind,
      color: channel.color,
      student: channel.student,
      memberCount: channel.members.length,
      members: channel.members.map((m) => m.user),
    },
  });
}
