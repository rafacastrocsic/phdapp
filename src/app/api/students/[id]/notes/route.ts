import { NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import {
  teamLevelForStudent,
  canSeeSupervisorPrivate,
  canWriteSupervisorPrivate,
  type Role,
} from "@/lib/access";

const Body = z.object({ body: z.string().min(1) });

// Non-supervisor viewers (students, external advisors, committee, unrelated)
// must not even learn this endpoint exists → always 404, never 403.
// READ is broader than WRITE: a Team Advisor ("observer") may read private
// notes but must never create one.
async function readGate(studentId: string, userId: string, role: Role) {
  const level = await teamLevelForStudent(studentId, userId, role);
  return canSeeSupervisorPrivate(level);
}
async function writeGate(studentId: string, userId: string, role: Role) {
  const level = await teamLevelForStudent(studentId, userId, role);
  return canWriteSupervisorPrivate(level);
}

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "unauth" }, { status: 401 });
  const { id } = await params;
  if (!(await readGate(id, session.user.id, session.user.role as Role)))
    return NextResponse.json({ error: "not found" }, { status: 404 });

  const notes = await prisma.supervisorNote.findMany({
    where: { studentId: id },
    orderBy: { createdAt: "desc" },
    include: {
      author: { select: { id: true, name: true, image: true, color: true } },
    },
  });
  return NextResponse.json({ notes, viewerId: session.user.id });
}

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "unauth" }, { status: 401 });
  const { id } = await params;
  if (!(await writeGate(id, session.user.id, session.user.role as Role)))
    return NextResponse.json({ error: "not found" }, { status: 404 });

  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success)
    return NextResponse.json({ error: "bad input" }, { status: 400 });

  const note = await prisma.supervisorNote.create({
    data: { studentId: id, authorId: session.user.id, body: parsed.data.body },
    include: {
      author: { select: { id: true, name: true, image: true, color: true } },
    },
  });
  return NextResponse.json({ note });
}
