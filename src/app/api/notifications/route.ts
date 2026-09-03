import { NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { studentVisibilityWhereAllForAdmin, type Role } from "@/lib/access";
import { isSeniorTeam } from "@/lib/discussions-access";

// Cross-user "someone did something" feed for the 🔔 bell, derived from the
// ActivityLog (single source of truth) so it reliably reflects every change
// — tasks, events, reading, availability — not a separate sparse table.
const ACTIONS = [
  "ticket.create",
  "ticket.update",
  "ticket.delete",
  "ticket.completion_requested",
  "event.create",
  "event.update",
  "event.delete",
  "reading.create",
  "reading.propose",
  "reading.decision",
  "reading.delete",
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

  const userId = session.user.id;
  const role = session.user.role as Role;

  const me = await prisma.user.findUnique({
    where: { id: userId },
    select: { notificationsLastSeenAt: true },
  });
  const since = me?.notificationsLastSeenAt ?? new Date(0);

  const visible = await prisma.student.findMany({
    where: studentVisibilityWhereAllForAdmin(userId, role),
    select: { id: true },
  });
  const studentIds = visible.map((s) => s.id);

  const where = {
    OR: [{ studentId: { in: studentIds } }, { studentId: null }],
    actorId: { not: userId },
    action: { in: ACTIONS },
  };

  // My Work lives outside the ActivityLog and is senior-team-only + per-item
  // private, so it can't ride the studentId-scoped query above. Instead we
  // fold in its events directly here, gated by isSeniorTeam and limited to
  // items the viewer can see (their own, or ones shared with the team).
  const senior = await isSeniorTeam(userId, role);
  const mwVisible = {
    involvementId: { not: null },
    authorId: { not: userId },
    involvement: { OR: [{ ownerId: userId }, { shared: true }] },
  };

  const [logs, logUnread, mwShared, mwComments, mwSharedUnread, mwCommentUnread] =
    await Promise.all([
      prisma.activityLog.findMany({
        where,
        orderBy: { createdAt: "desc" },
        take: 20,
        include: { actor: { select: { name: true } } },
      }),
      prisma.activityLog.count({ where: { ...where, createdAt: { gt: since } } }),
      senior
        ? prisma.involvement.findMany({
            where: { shared: true, ownerId: { not: userId } },
            orderBy: { createdAt: "desc" },
            take: 20,
            select: {
              id: true,
              title: true,
              createdAt: true,
              owner: { select: { name: true } },
            },
          })
        : Promise.resolve([] as never[]),
      senior
        ? prisma.comment.findMany({
            where: mwVisible,
            orderBy: { createdAt: "desc" },
            take: 20,
            select: {
              id: true,
              createdAt: true,
              author: { select: { name: true } },
              involvement: { select: { title: true } },
            },
          })
        : Promise.resolve([] as never[]),
      senior
        ? prisma.involvement.count({
            where: {
              shared: true,
              ownerId: { not: userId },
              createdAt: { gt: since },
            },
          })
        : Promise.resolve(0),
      senior
        ? prisma.comment.count({ where: { ...mwVisible, createdAt: { gt: since } } })
        : Promise.resolve(0),
    ]);

  const first = (n: string | null | undefined) => n?.split(" ")[0] ?? "Someone";

  const items = [
    ...logs.map((l) => ({
      id: l.id,
      type: l.action,
      message: `${first(l.actor?.name)} ${l.summary}`,
      link: linkFor(l.action, l.entityId),
      read: l.createdAt <= since,
      createdAt: l.createdAt.toISOString(),
    })),
    ...mwShared.map((i) => ({
      id: `mw-item-${i.id}`,
      type: "mywork.share",
      message: `${first(i.owner?.name)} shared “${i.title}” in My Work`,
      link: "/my-work",
      read: i.createdAt <= since,
      createdAt: i.createdAt.toISOString(),
    })),
    ...mwComments.map((c) => ({
      id: `mw-comment-${c.id}`,
      type: "mywork.comment",
      message: `${first(c.author?.name)} commented on “${
        c.involvement?.title ?? "an item"
      }” in My Work`,
      link: "/my-work",
      read: c.createdAt <= since,
      createdAt: c.createdAt.toISOString(),
    })),
  ]
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    .slice(0, 20);

  return NextResponse.json({
    items,
    unread: logUnread + mwSharedUnread + mwCommentUnread,
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
