import { NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { type Role } from "@/lib/access";
import { buildNewsFeed } from "@/lib/news";

export async function GET() {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "unauth" }, { status: 401 });
  const feed = await buildNewsFeed(session.user.id, session.user.role as Role);
  return NextResponse.json(feed);
}

const Body = z.object({
  action: z.enum(["seen", "enable", "disable"]),
});

export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "unauth" }, { status: 401 });
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success)
    return NextResponse.json({ error: "bad input" }, { status: 400 });

  const data: { newsLastSeenAt?: Date; newsEnabled?: boolean } = {};
  // "seen" advances the dismissed marker; enable/disable is the personal opt.
  if (parsed.data.action === "seen") data.newsLastSeenAt = new Date();
  if (parsed.data.action === "enable") data.newsEnabled = true;
  if (parsed.data.action === "disable") data.newsEnabled = false;

  await prisma.user.update({ where: { id: session.user.id }, data });
  return NextResponse.json({ ok: true });
}
