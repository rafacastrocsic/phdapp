import { NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { isAdmin, type Role } from "@/lib/access";

async function requireAdmin() {
  const session = await auth();
  if (!session?.user) return { error: "unauth" as const, status: 401 };
  if (!isAdmin(session.user.role as Role))
    return { error: "forbidden" as const, status: 403 };
  return { userId: session.user.id };
}

const Patch = z.object({
  title: z.string().min(1).max(200).optional(),
  body: z.string().min(1).max(20000).optional(),
});

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const gate = await requireAdmin();
  if ("error" in gate)
    return NextResponse.json({ error: gate.error }, { status: gate.status });
  const { id } = await params;
  const parsed = Patch.safeParse(await req.json().catch(() => null));
  if (!parsed.success)
    return NextResponse.json({ error: "bad input" }, { status: 400 });
  const data: Record<string, unknown> = {};
  if (parsed.data.title !== undefined) data.title = parsed.data.title.trim();
  if (parsed.data.body !== undefined) data.body = parsed.data.body.trim();
  await prisma.newsPost.update({ where: { id }, data });
  return NextResponse.json({ ok: true });
}

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const gate = await requireAdmin();
  if ("error" in gate)
    return NextResponse.json({ error: gate.error }, { status: gate.status });
  const { id } = await params;
  await prisma.newsPost.delete({ where: { id } }).catch(() => {});
  return NextResponse.json({ ok: true });
}
