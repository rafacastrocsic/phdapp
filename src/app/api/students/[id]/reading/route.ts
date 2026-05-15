import { NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { teamLevelForStudent, type Role } from "@/lib/access";

const Body = z.object({
  title: z.string().min(1),
  authors: z.string().nullable().optional(),
  url: z.string().nullable().optional(),
});

const authorSel = { select: { id: true, name: true, image: true, color: true } };

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "unauth" }, { status: 401 });
  const { id } = await params;
  const level = await teamLevelForStudent(id, session.user.id, session.user.role as Role);
  if (level === null) return NextResponse.json({ error: "not found" }, { status: 404 });

  const items = await prisma.readingItem.findMany({
    where: { studentId: id },
    orderBy: [{ createdAt: "desc" }],
    include: { addedBy: authorSel, decisionBy: authorSel },
  });
  return NextResponse.json({
    items,
    level, // "supervisor" | "advisor" | "committee" | "self"
  });
}

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "unauth" }, { status: 401 });
  const { id } = await params;
  const level = await teamLevelForStudent(id, session.user.id, session.user.role as Role);
  if (level !== "supervisor" && level !== "self")
    return NextResponse.json(
      { error: "Only supervisors or the student can add readings" },
      { status: 403 },
    );

  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success)
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "bad input" },
      { status: 400 },
    );
  const d = parsed.data;

  // Student proposes (needs approval); supervisor adds approved directly.
  const isStudent = level === "self";
  const item = await prisma.readingItem.create({
    data: {
      studentId: id,
      title: d.title,
      authors: d.authors ?? null,
      url: d.url ?? null,
      addedById: session.user.id,
      proposedByStudent: isStudent,
      status: isStudent ? "proposed" : "approved",
      decisionById: isStudent ? null : session.user.id,
    },
    include: { addedBy: authorSel, decisionBy: authorSel },
  });
  return NextResponse.json({ item });
}
