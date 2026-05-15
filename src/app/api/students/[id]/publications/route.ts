import { NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { teamLevelForStudent, type Role } from "@/lib/access";

const Body = z.object({
  title: z.string().min(1),
  venue: z.string().nullable().optional(),
  type: z.string().optional(),
  status: z.string().optional(),
  authors: z.string().nullable().optional(),
  url: z.string().nullable().optional(),
  submittedAt: z.string().nullable().optional(),
  decisionAt: z.string().nullable().optional(),
  notes: z.string().nullable().optional(),
});

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "unauth" }, { status: 401 });
  const { id } = await params;
  const level = await teamLevelForStudent(id, session.user.id, session.user.role as Role);
  if (level === null) return NextResponse.json({ error: "not found" }, { status: 404 });

  const publications = await prisma.publication.findMany({
    where: { studentId: id },
    orderBy: [{ submittedAt: "desc" }, { createdAt: "desc" }],
  });
  return NextResponse.json({
    publications,
    canWrite: level === "supervisor" || level === "self",
  });
}

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "unauth" }, { status: 401 });
  const { id } = await params;
  const level = await teamLevelForStudent(id, session.user.id, session.user.role as Role);
  if (level !== "supervisor" && level !== "self")
    return NextResponse.json(
      { error: "Only supervisors can edit publications" },
      { status: 403 },
    );

  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success)
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "bad input" },
      { status: 400 },
    );
  const d = parsed.data;

  const publication = await prisma.publication.create({
    data: {
      studentId: id,
      title: d.title,
      venue: d.venue ?? null,
      type: d.type ?? "journal",
      status: d.status ?? "in_prep",
      authors: d.authors ?? null,
      url: d.url ?? null,
      submittedAt: d.submittedAt ? new Date(d.submittedAt) : null,
      decisionAt: d.decisionAt ? new Date(d.decisionAt) : null,
      notes: d.notes ?? null,
    },
  });
  return NextResponse.json({ publication });
}
