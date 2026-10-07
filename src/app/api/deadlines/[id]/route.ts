import { NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { studentVisibilityWhereAllForAdmin, type Role } from "@/lib/access";
import { isSeniorTeam } from "@/lib/discussions-access";

const Patch = z.object({
  title: z.string().min(1).max(300).optional(),
  kind: z.enum(["call", "report", "internal"]).optional(),
  opensAt: z.string().nullable().optional(),
  closesAt: z.string().optional(),
  url: z.string().nullable().optional(),
  notes: z.string().max(5000).nullable().optional(),
  driveFolderUrl: z.string().nullable().optional(),
  studentId: z.string().nullable().optional(),
});

async function gate() {
  const session = await auth();
  if (!session?.user) return { error: "unauth" as const, status: 401 };
  const role = session.user.role as Role;
  if (!(await isSeniorTeam(session.user.id, role)))
    return { error: "Only the supervising team can edit calls and deadlines." as const, status: 403 };
  return { userId: session.user.id, role };
}

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const g = await gate();
  if ("error" in g) return NextResponse.json({ error: g.error }, { status: g.status });
  const { id } = await params;
  const parsed = Patch.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "bad input" }, { status: 400 });
  const d = parsed.data;

  const data: Record<string, unknown> = {};
  if (d.title !== undefined) data.title = d.title.trim();
  if (d.kind !== undefined) data.kind = d.kind;
  if (d.url !== undefined) data.url = d.url?.trim() || null;
  if (d.notes !== undefined) data.notes = d.notes?.trim() || null;
  if (d.driveFolderUrl !== undefined) data.driveFolderUrl = d.driveFolderUrl?.trim() || null;
  if (d.opensAt !== undefined) {
    const v = d.opensAt ? new Date(d.opensAt) : null;
    if (v && isNaN(v.getTime())) return NextResponse.json({ error: "bad date" }, { status: 400 });
    data.opensAt = v;
  }
  if (d.closesAt !== undefined) {
    const v = new Date(d.closesAt);
    if (isNaN(v.getTime())) return NextResponse.json({ error: "bad date" }, { status: 400 });
    data.closesAt = v;
  }
  if (d.studentId !== undefined) {
    if (d.studentId) {
      const visible = await prisma.student.findFirst({
        where: { id: d.studentId, ...studentVisibilityWhereAllForAdmin(g.userId, g.role) },
        select: { id: true },
      });
      if (!visible)
        return NextResponse.json({ error: "That student isn't visible to you." }, { status: 400 });
      data.studentId = visible.id;
    } else data.studentId = null;
  }

  await prisma.deadline.update({ where: { id }, data });
  return NextResponse.json({ ok: true });
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const g = await gate();
  if ("error" in g) return NextResponse.json({ error: g.error }, { status: g.status });
  const { id } = await params;
  await prisma.deadline.delete({ where: { id } }).catch(() => {});
  return NextResponse.json({ ok: true });
}
