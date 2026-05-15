import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";

// Delete one of the signed-in user's own availability entries.
export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "unauth" }, { status: 401 });
  const { id } = await params;
  const item = await prisma.availability.findFirst({
    where: { id, userId: session.user.id },
    select: { id: true },
  });
  if (!item) return NextResponse.json({ error: "not found" }, { status: 404 });
  await prisma.availability.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}
