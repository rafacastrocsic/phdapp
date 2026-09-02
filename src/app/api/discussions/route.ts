import { NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { studentVisibilityWhereAllForAdmin, type Role } from "@/lib/access";
import { isSeniorTeam } from "@/lib/discussions-access";
import { LinkInput, sanitiseLinks } from "@/lib/links";
import { logActivity } from "@/lib/activity-log";

const Body = z.object({
  title: z.string().min(1).max(200),
  body: z.string().max(20000).nullable().optional(),
  visibility: z.enum(["supervisors", "team"]).default("supervisors"),
  // Optional student TAG (metadata only). null / omitted = general topic.
  studentId: z.string().nullable().optional(),
  links: z.array(LinkInput).optional(),
  driveFolderUrl: z.string().nullable().optional(),
});

// Create a discussion topic. Only the senior team may open topics; students
// can read "team" topics and comment, but not start one.
export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user)
    return NextResponse.json({ error: "unauth" }, { status: 401 });
  const role = session.user.role as Role;

  // Anyone can start a discussion topic. Only the senior team, however, may
  // open a "supervisors only" topic — everyone else is coerced to a
  // whole-team topic (they can't create something they couldn't even see).
  const senior = await isSeniorTeam(session.user.id, role);

  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success)
    return NextResponse.json({ error: "bad input" }, { status: 400 });
  const d = parsed.data;
  const visibility = senior ? d.visibility : "team";

  // A tagged student must be one this user can see.
  let studentId: string | null = null;
  if (d.studentId) {
    const visible = await prisma.student.findFirst({
      where: {
        id: d.studentId,
        ...studentVisibilityWhereAllForAdmin(session.user.id, role),
      },
      select: { id: true },
    });
    if (!visible)
      return NextResponse.json(
        { error: "That student isn't visible to you." },
        { status: 400 },
      );
    studentId = visible.id;
  }

  const sane = d.links ? sanitiseLinks(d.links) : [];
  const topic = await prisma.topic.create({
    data: {
      title: d.title.trim(),
      body: d.body?.trim() || null,
      authorId: session.user.id,
      visibility,
      studentId,
      links: sane.length > 0 ? JSON.stringify(sane) : null,
      driveFolderUrl: d.driveFolderUrl || null,
    },
    select: { id: true, title: true },
  });

  await logActivity({
    actorId: session.user.id,
    actorRole: session.user.role,
    studentId,
    action: "discussion.create",
    entityType: "topic",
    entityId: topic.id,
    summary: `started discussion “${topic.title}”`,
  });

  return NextResponse.json({ id: topic.id });
}
