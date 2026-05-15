import { NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";

export async function GET() {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "unauth" }, { status: 401 });
  const [items, unread] = await Promise.all([
    prisma.notification.findMany({
      where: { userId: session.user.id },
      orderBy: { createdAt: "desc" },
      take: 20,
    }),
    prisma.notification.count({
      where: { userId: session.user.id, readAt: null },
    }),
  ]);
  return NextResponse.json({
    items: items.map((n) => ({
      id: n.id,
      type: n.type,
      message: n.message,
      link: n.link,
      read: !!n.readAt,
      createdAt: n.createdAt.toISOString(),
    })),
    unread,
  });
}

const Body = z.object({
  id: z.string().optional(),
  all: z.boolean().optional(),
});

export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "unauth" }, { status: 401 });
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success)
    return NextResponse.json({ error: "bad input" }, { status: 400 });
  const now = new Date();
  if (parsed.data.all) {
    await prisma.notification.updateMany({
      where: { userId: session.user.id, readAt: null },
      data: { readAt: now },
    });
  } else if (parsed.data.id) {
    await prisma.notification.updateMany({
      where: { id: parsed.data.id, userId: session.user.id },
      data: { readAt: now },
    });
  }
  return NextResponse.json({ ok: true });
}
