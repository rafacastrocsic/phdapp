import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { isSupervisingUser, isAdmin, type Role } from "@/lib/access";

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "unauth" }, { status: 401 });
  if (!(await isSupervisingUser(session.user.id, session.user.role as Role)))
    return NextResponse.json({ error: "not found" }, { status: 404 });
  const { id } = await params;
  const note = await prisma.teamNote.findUnique({
    where: { id },
    select: { id: true, authorId: true },
  });
  if (!note) return NextResponse.json({ error: "not found" }, { status: 404 });
  if (note.authorId !== session.user.id && !isAdmin(session.user.role))
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  await prisma.teamNote.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}
