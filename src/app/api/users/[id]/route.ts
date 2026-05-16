import { NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";

const Patch = z.object({
  name: z.string().min(1).optional(),
  color: z.string().optional(),
  image: z.string().nullable().optional(),
  role: z.enum(["admin", "supervisor", "student"]).optional(),
});

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "unauth" }, { status: 401 });

  const { id } = await params;
  const isAdmin = session.user.role === "admin";
  const isSelf = session.user.id === id;
  if (!isAdmin && !isSelf)
    return NextResponse.json(
      { error: "You can only edit your own profile (or be admin)" },
      { status: 403 },
    );

  const json = await req.json().catch(() => null);
  const parsed = Patch.safeParse(json);
  if (!parsed.success) return NextResponse.json({ error: "bad input" }, { status: 400 });
  const d = parsed.data;

  const data: Record<string, unknown> = {};
  if (d.name !== undefined) data.name = d.name;
  if (d.color !== undefined) data.color = d.color;
  if (d.image !== undefined) data.image = d.image;
  if (d.role !== undefined) {
    if (!isAdmin)
      return NextResponse.json(
        { error: "Only the admin can change a user's role" },
        { status: 403 },
      );
    // Don't let admin demote themselves accidentally
    if (id === session.user.id && d.role !== "admin")
      return NextResponse.json(
        { error: "You can't change your own admin role from here." },
        { status: 400 },
      );
    data.role = d.role;
  }

  await prisma.user.update({ where: { id }, data });
  if (d.image !== undefined) {
    await prisma.student.updateMany({
      where: { userId: id },
      data: { avatarUrl: d.image },
    });
  }
  return NextResponse.json({ ok: true });
}

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "unauth" }, { status: 401 });
  if (session.user.role !== "admin")
    return NextResponse.json({ error: "Admin only" }, { status: 403 });

  const { id } = await params;
  if (id === session.user.id)
    return NextResponse.json({ error: "You can't delete yourself." }, { status: 400 });

  // Block deletion if the user supervises any students. Reassign them first.
  const u = await prisma.user.findUnique({
    where: { id },
    include: { _count: { select: { supervisedStudents: true } } },
  });
  if (!u) return NextResponse.json({ error: "not found" }, { status: 404 });
  if (u._count.supervisedStudents > 0)
    return NextResponse.json(
      {
        error: `Can't delete: this user still supervises ${u._count.supervisedStudents} student(s). Reassign them to another supervisor first.`,
      },
      { status: 409 },
    );

  await prisma.user.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}
