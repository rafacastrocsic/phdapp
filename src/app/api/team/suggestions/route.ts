import { NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import {
  isSupervisingUser,
  isTeamAdvisorAnywhere,
  isAdmin,
  type Role,
} from "@/lib/access";

const Body = z.object({
  body: z.string().min(1),
  studentIds: z.array(z.string()).optional(),
});

const authorSel = { select: { id: true, name: true, image: true, color: true } };

// The advisor-suggestions thread is the channel a Team Advisor uses to send
// suggestions to the supervisors. Visible to supervising users, the admin,
// and team advisors themselves; only team advisors (and the admin) can post.
// "Team advisor" is now a per-student CoSupervisor link, so the gate is
// "is a team advisor of ≥1 student" rather than a global role.
async function canRead(userId: string, role: Role) {
  return (
    isAdmin(role) ||
    (await isSupervisingUser(userId, role)) ||
    (await isTeamAdvisorAnywhere(userId))
  );
}
async function canPost(userId: string, role: Role) {
  return isAdmin(role) || (await isTeamAdvisorAnywhere(userId));
}

export async function GET() {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "unauth" }, { status: 401 });
  const role = session.user.role as Role;
  if (!(await canRead(session.user.id, role)))
    return NextResponse.json({ error: "not found" }, { status: 404 });

  const rows = await prisma.advisorSuggestion.findMany({
    orderBy: { createdAt: "desc" },
    take: 100,
    include: { author: authorSel },
  });

  // Resolve tagged student names in one query.
  const ids = [...new Set(rows.flatMap((r) => r.studentIds))];
  const students = ids.length
    ? await prisma.student.findMany({
        where: { id: { in: ids } },
        select: { id: true, fullName: true, alias: true, color: true },
      })
    : [];
  const byId = new Map(students.map((s) => [s.id, s]));

  return NextResponse.json({
    viewerId: session.user.id,
    canPost: await canPost(session.user.id, role),
    isAdmin: isAdmin(role),
    suggestions: rows.map((r) => ({
      id: r.id,
      body: r.body,
      createdAt: r.createdAt.toISOString(),
      author: r.author,
      students: r.studentIds
        .map((sid) => byId.get(sid))
        .filter((s): s is NonNullable<typeof s> => !!s)
        .map((s) => ({
          id: s.id,
          name: s.alias?.trim() || s.fullName,
          color: s.color,
        })),
    })),
  });
}

export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "unauth" }, { status: 401 });
  const role = session.user.role as Role;
  if (!(await canPost(session.user.id, role)))
    return NextResponse.json(
      { error: "Only Team Advisors can post suggestions" },
      { status: 403 },
    );

  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success)
    return NextResponse.json({ error: "bad input" }, { status: 400 });

  // Only keep student ids that actually exist (drop anything stale/forged).
  let studentIds: string[] = [];
  if (parsed.data.studentIds?.length) {
    const found = await prisma.student.findMany({
      where: { id: { in: parsed.data.studentIds } },
      select: { id: true },
    });
    studentIds = found.map((s) => s.id);
  }

  const row = await prisma.advisorSuggestion.create({
    data: { authorId: session.user.id, body: parsed.data.body, studentIds },
    include: { author: authorSel },
  });

  return NextResponse.json({ ok: true, id: row.id });
}
