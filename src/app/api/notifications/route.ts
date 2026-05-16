import { NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { studentVisibilityWhereAllForAdmin, type Role } from "@/lib/access";

// Cross-user "someone did something" feed for the 🔔 bell, derived from the
// ActivityLog (single source of truth) so it reliably reflects every change
// — tasks, events, reading, availability — not a separate sparse table.
const ACTIONS = [
  "ticket.create",
  "ticket.update",
  "ticket.delete",
  "event.create",
  "event.update",
  "event.delete",
  "reading.create",
  "reading.propose",
  "reading.decision",
  "availability.create",
];

function linkFor(action: string, entityId: string | null): string | null {
  if (!entityId) {
    if (action.startsWith("availability")) return "/calendar";
    return null;
  }
  if (action.startsWith("ticket")) return `/kanban?ticket=${entityId}`;
  if (action.startsWith("event") || action.startsWith("availability"))
    return "/calendar";
  if (action.startsWith("reading")) return "/reading";
  return null;
}

export async function GET() {
  const session = await auth();
  if (!session?.user)
    return NextResponse.json({ items: [], unread: 0 });

  const me = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { notificationsLastSeenAt: true },
  });
  const since = me?.notificationsLastSeenAt ?? new Date(0);

  const visible = await prisma.student.findMany({
    where: studentVisibilityWhereAllForAdmin(
      session.user.id,
      session.user.role as Role,
    ),
    select: { id: true },
  });
  const studentIds = visible.map((s) => s.id);

  const where = {
    OR: [{ studentId: { in: studentIds } }, { studentId: null }],
    actorId: { not: session.user.id },
    action: { in: ACTIONS },
  };

  const [logs, unread] = await Promise.all([
    prisma.activityLog.findMany({
      where,
      orderBy: { createdAt: "desc" },
      take: 20,
      include: { actor: { select: { name: true } } },
    }),
    prisma.activityLog.count({
      where: { ...where, createdAt: { gt: since } },
    }),
  ]);

  return NextResponse.json({
    items: logs.map((l) => ({
      id: l.id,
      type: l.action,
      message: `${l.actor?.name?.split(" ")[0] ?? "Someone"} ${l.summary}`,
      link: linkFor(l.action, l.entityId),
      read: l.createdAt <= since,
      createdAt: l.createdAt.toISOString(),
    })),
    unread,
  });
}

const Body = z.object({ id: z.string().optional(), all: z.boolean().optional() });

// Mark-all-read = advance the seen timestamp. Per-item read isn't tracked
// (the feed is log-derived); clicking an item just navigates.
export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "unauth" }, { status: 401 });
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success)
    return NextResponse.json({ error: "bad input" }, { status: 400 });
  if (parsed.data.all) {
    await prisma.user.update({
      where: { id: session.user.id },
      data: { notificationsLastSeenAt: new Date() },
    });
  }
  return NextResponse.json({ ok: true });
}
