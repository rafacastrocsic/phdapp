import { NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { isSupervisingUser, type Role } from "@/lib/access";

const Body = z.object({ body: z.string().min(1) });
const authorSel = { select: { id: true, name: true, image: true, color: true } };

// Group-level supervisor workspace: only "real" supervisors + admin.
// Advisors/committee-only users and students get 404 (don't leak it exists).
async function gate(userId: string, role: Role) {
  return isSupervisingUser(userId, role);
}

export async function GET() {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "unauth" }, { status: 401 });
  if (!(await gate(session.user.id, session.user.role as Role)))
    return NextResponse.json({ error: "not found" }, { status: 404 });
  const notes = await prisma.teamNote.findMany({
    orderBy: { createdAt: "desc" },
    include: { author: authorSel },
  });
  return NextResponse.json({ notes, viewerId: session.user.id });
}

export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "unauth" }, { status: 401 });
  if (!(await gate(session.user.id, session.user.role as Role)))
    return NextResponse.json({ error: "not found" }, { status: 404 });
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success)
    return NextResponse.json({ error: "bad input" }, { status: 400 });
  const note = await prisma.teamNote.create({
    data: { authorId: session.user.id, body: parsed.data.body },
    include: { author: authorSel },
  });
  return NextResponse.json({ note });
}
