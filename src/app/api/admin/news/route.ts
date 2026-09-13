import { NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { isAdmin, type Role } from "@/lib/access";
import { NEWS_ENABLED_KEY, isNewsGloballyEnabled } from "@/lib/news";

async function requireAdmin() {
  const session = await auth();
  if (!session?.user) return { error: "unauth" as const, status: 401 };
  if (!isAdmin(session.user.role as Role))
    return { error: "forbidden" as const, status: 403 };
  return { userId: session.user.id };
}

// List all announcements + the global on/off state (admin panel).
export async function GET() {
  const gate = await requireAdmin();
  if ("error" in gate)
    return NextResponse.json({ error: gate.error }, { status: gate.status });
  const [posts, enabled] = await Promise.all([
    prisma.newsPost.findMany({
      orderBy: { publishedAt: "desc" },
      take: 100,
      select: { id: true, title: true, body: true, publishedAt: true },
    }),
    isNewsGloballyEnabled(),
  ]);
  return NextResponse.json({
    enabled,
    posts: posts.map((p) => ({ ...p, publishedAt: p.publishedAt.toISOString() })),
  });
}

const Body = z.discriminatedUnion("kind", [
  z.object({
    kind: z.literal("post"),
    title: z.string().min(1).max(200),
    body: z.string().min(1).max(20000),
  }),
  z.object({ kind: z.literal("toggle"), enabled: z.boolean() }),
]);

// Create an announcement, or flip the global News toggle.
export async function POST(req: Request) {
  const gate = await requireAdmin();
  if ("error" in gate)
    return NextResponse.json({ error: gate.error }, { status: gate.status });
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success)
    return NextResponse.json({ error: "bad input" }, { status: 400 });

  if (parsed.data.kind === "toggle") {
    await prisma.setting.upsert({
      where: { key: NEWS_ENABLED_KEY },
      create: { key: NEWS_ENABLED_KEY, value: parsed.data.enabled ? "true" : "false" },
      update: { value: parsed.data.enabled ? "true" : "false" },
    });
    return NextResponse.json({ ok: true, enabled: parsed.data.enabled });
  }

  const post = await prisma.newsPost.create({
    data: {
      title: parsed.data.title.trim(),
      body: parsed.data.body.trim(),
      authorId: gate.userId,
    },
    select: { id: true },
  });
  return NextResponse.json({ ok: true, id: post.id });
}
