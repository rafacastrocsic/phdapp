import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";

export async function POST() {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ ok: false }, { status: 401 });
  await prisma.user.update({
    where: { id: session.user.id },
    data: { kanbanLastSeenAt: new Date() },
  });
  return NextResponse.json({ ok: true });
}
