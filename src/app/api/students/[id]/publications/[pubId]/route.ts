import { NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { teamLevelForStudent, type Role } from "@/lib/access";

const Patch = z.object({
  title: z.string().min(1).optional(),
  venue: z.string().nullable().optional(),
  type: z.string().optional(),
  status: z.string().optional(),
  authors: z.string().nullable().optional(),
  url: z.string().nullable().optional(),
  driveUrl: z.string().nullable().optional(),
  submittedAt: z.string().nullable().optional(),
  decisionAt: z.string().nullable().optional(),
  notes: z.string().nullable().optional(),
});

async function canWrite(studentId: string, userId: string, role: Role) {
  const level = await teamLevelForStudent(studentId, userId, role);
  return level === "supervisor" || level === "self";
}

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string; pubId: string }> },
) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "unauth" }, { status: 401 });
  const { id, pubId } = await params;
  if (!(await canWrite(id, session.user.id, session.user.role as Role)))
    return NextResponse.json({ error: "forbidden" }, { status: 403 });

  const parsed = Patch.safeParse(await req.json().catch(() => null));
  if (!parsed.success)
    return NextResponse.json({ error: "bad input" }, { status: 400 });
  const d = parsed.data;

  const existing = await prisma.publication.findFirst({
    where: { id: pubId, studentId: id },
    select: { id: true },
  });
  if (!existing) return NextResponse.json({ error: "not found" }, { status: 404 });

  const data: Record<string, unknown> = {};
  if (d.title !== undefined) data.title = d.title;
  if (d.venue !== undefined) data.venue = d.venue;
  if (d.type !== undefined) data.type = d.type;
  if (d.status !== undefined) data.status = d.status;
  if (d.authors !== undefined) data.authors = d.authors;
  if (d.url !== undefined) data.url = d.url;
  if (d.driveUrl !== undefined) data.driveUrl = d.driveUrl;
  if (d.submittedAt !== undefined)
    data.submittedAt = d.submittedAt ? new Date(d.submittedAt) : null;
  if (d.decisionAt !== undefined)
    data.decisionAt = d.decisionAt ? new Date(d.decisionAt) : null;
  if (d.notes !== undefined) data.notes = d.notes;

  const publication = await prisma.publication.update({
    where: { id: pubId },
    data,
  });
  return NextResponse.json({ publication });
}

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string; pubId: string }> },
) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "unauth" }, { status: 401 });
  const { id, pubId } = await params;
  if (!(await canWrite(id, session.user.id, session.user.role as Role)))
    return NextResponse.json({ error: "forbidden" }, { status: 403 });

  const existing = await prisma.publication.findFirst({
    where: { id: pubId, studentId: id },
    select: { id: true },
  });
  if (!existing) return NextResponse.json({ error: "not found" }, { status: 404 });

  await prisma.publication.delete({ where: { id: pubId } });
  return NextResponse.json({ ok: true });
}
