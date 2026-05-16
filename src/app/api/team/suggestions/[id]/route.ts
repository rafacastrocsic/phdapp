import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { isAdmin } from "@/lib/access";

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "unauth" }, { status: 401 });
  const { id } = await params;

  const row = await prisma.advisorSuggestion.findUnique({
    where: { id },
    select: { id: true, authorId: true },
  });
  if (!row) return NextResponse.json({ error: "not found" }, { status: 404 });

  if (row.authorId !== session.user.id && !isAdmin(session.user.role))
    return NextResponse.json(
      { error: "Only the author or an admin can delete this" },
      { status: 403 },
    );

  await prisma.advisorSuggestion.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}
