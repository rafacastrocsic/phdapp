import { NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { isSupervisingUser, isAdmin, type Role } from "@/lib/access";

const KINDS = ["cosupervisors", "student", "direct", "general"] as const;
const Body = z.object({
  name: z.string().min(1),
  kind: z.enum(KINDS).default("cosupervisors"),
  studentId: z.string().optional(),
  memberIds: z.string().optional(), // JSON-encoded
});

export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "unauth" }, { status: 401 });
  const role = session.user.role as Role;

  const json = await req.json().catch(() => null);
  const parsed = Body.safeParse(json);
  if (!parsed.success) return NextResponse.json({ error: "bad input" }, { status: 400 });
  const d = parsed.data;

  let requestedMembers: string[] = [];
  try {
    const arr = JSON.parse(d.memberIds ?? "[]");
    if (Array.isArray(arr)) requestedMembers = arr.filter((x) => typeof x === "string");
  } catch {
    /* ignore — treat as no members */
  }

  let effectiveStudentId: string | null = d.studentId || null;
  let memberIds = requestedMembers;

  if (role === "student") {
    // A student may only create a channel ABOUT THEMSELVES, and only with
    // their own supervisors (primary or co_supervisor) — never `general`,
    // never with team/external/committee advisors, never with other students.
    if (d.kind === "general")
      return NextResponse.json(
        { error: "Students can only message their own supervisors" },
        { status: 403 },
      );
    const me = await prisma.student.findFirst({
      where: { userId: session.user.id },
      select: {
        id: true,
        supervisorId: true,
        coSupervisors: {
          where: { role: { in: ["supervisor", "co_supervisor"] } },
          select: { userId: true },
        },
      },
    });
    if (!me)
      return NextResponse.json(
        { error: "No student profile is linked to your account" },
        { status: 403 },
      );
    effectiveStudentId = me.id;
    const allowed = new Set<string>(
      [me.supervisorId, ...me.coSupervisors.map((c) => c.userId)].filter(
        (x): x is string => !!x,
      ),
    );
    const disallowed = requestedMembers.filter((id) => !allowed.has(id));
    if (disallowed.length > 0)
      return NextResponse.json(
        {
          error:
            "You can only start a channel with your supervisors — not advisors, committee members, or other students.",
        },
        { status: 403 },
      );
    memberIds = requestedMembers.filter((id) => allowed.has(id));
  } else {
    // Non-students. A `general` channel is readable/postable by EVERYONE —
    // restrict creation to real supervisors / admin.
    if (
      d.kind === "general" &&
      !(isAdmin(role) || (await isSupervisingUser(session.user.id, role)))
    )
      return NextResponse.json(
        { error: "Only supervisors or the admin can create a general channel" },
        { status: 403 },
      );

    // If a student is linked, only one of that student's supervisors (NOT a
    // read-only team advisor), OR the student themselves, can create a
    // channel about them.
    if (effectiveStudentId) {
      const allowed = await prisma.student.findFirst({
        where: {
          id: effectiveStudentId,
          OR: [
            { supervisorId: session.user.id },
            {
              coSupervisors: {
                some: { userId: session.user.id, role: { not: "team_advisor" } },
              },
            },
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
  }

  const colorByKind: Record<string, string> = {
    cosupervisors: "#00d1c1",
    student: "#ec4899",
    direct: "#6f4cff",
    general: "#ffcc4d",
  };

  const allMemberIds = Array.from(new Set([session.user.id, ...memberIds]));

  const channel = await prisma.channel.create({
    data: {
      name: d.name,
      kind: d.kind,
      color: colorByKind[d.kind] ?? "#6f4cff",
      studentId: effectiveStudentId,
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
