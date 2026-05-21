import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import {
  isAdmin,
  isSupervisingUser,
  isTeamAdvisorAnywhere,
  studentVisibilityWhereAllForAdmin,
  type Role,
} from "@/lib/access";
import { computeUnreadByChannel } from "@/lib/chat-access";
import { getDismissedTicketIds } from "@/lib/kanban-dismissed";
import { getDismissedEventIds } from "@/lib/calendar-dismissed";

// Aggregated unread-counts endpoint.
//
// Why: the sidebar (and the chat tab-title alert) used to fire six
// independent unread fetches every ~5 seconds, which dominated this
// project's Vercel function-invocation usage (5×–6× more invocations
// than necessary). This single endpoint runs all six lookups in
// parallel inside one function invocation and returns them in one
// shape, so the client can poll exactly once per tick.
//
// Response shape kept compatible with the previous per-module GETs so
// that consumers (sidebar, chat-view, tab-alerts) can read the same
// fields they already know.
export async function GET() {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({
      chat: { count: 0, byChannel: {}, latestSender: null },
      kanban: { count: 0, ticketIds: [] },
      calendar: { count: 0, highlightByEvent: {} },
      reading: { count: 0 },
      team: { count: 0 },
      feedback: { count: 0 },
    });
  }
  const userId = session.user.id;
  const role = session.user.role as Role;

  const [
    chatBlob,
    kanbanBlob,
    calendarBlob,
    readingCount,
    teamCount,
    feedbackCount,
  ] = await Promise.all([
    computeChat(userId),
    computeKanban(userId, role),
    computeCalendar(userId, role),
    computeReading(userId, role),
    computeTeam(userId, role),
    computeFeedback(userId, role),
  ]);

  return NextResponse.json({
    chat: chatBlob,
    kanban: kanbanBlob,
    calendar: calendarBlob,
    reading: { count: readingCount },
    team: { count: teamCount },
    feedback: { count: feedbackCount },
  });
}

// ─── chat ───────────────────────────────────────────────────────────────
async function computeChat(userId: string) {
  const { total, byChannel } = await computeUnreadByChannel(userId);
  let latestSender: string | null = null;
  if (total > 0) {
    const unreadChannelIds = Object.keys(byChannel).filter(
      (id) => byChannel[id] > 0,
    );
    if (unreadChannelIds.length > 0) {
      const memberships = await prisma.channelMember.findMany({
        where: { userId, channelId: { in: unreadChannelIds } },
        select: { channelId: true, lastRead: true },
      });
      const lastRead = new Map(
        memberships.map((m) => [m.channelId, m.lastRead]),
      );
      const msg = await prisma.message.findFirst({
        where: {
          channelId: { in: unreadChannelIds },
          authorId: { not: userId },
        },
        orderBy: { createdAt: "desc" },
        select: {
          createdAt: true,
          channelId: true,
          author: { select: { name: true } },
        },
      });
      if (
        msg &&
        msg.createdAt > (lastRead.get(msg.channelId) ?? new Date(0))
      )
        latestSender = msg.author?.name ?? null;
    }
  }
  return { count: total, byChannel, latestSender };
}

// ─── kanban ─────────────────────────────────────────────────────────────
async function computeKanban(userId: string, role: Role) {
  const me = await prisma.user.findUnique({
    where: { id: userId },
    select: { kanbanLastSeenAt: true },
  });
  const since = me?.kanbanLastSeenAt ?? new Date(0);

  const visible = await prisma.student.findMany({
    where: studentVisibilityWhereAllForAdmin(userId, role),
    select: { id: true },
  });
  const studentIds = visible.map((s) => s.id);
  if (studentIds.length === 0) return { count: 0, ticketIds: [] as string[] };

  const dismissed = await getDismissedTicketIds(userId);
  const logs = await prisma.activityLog.findMany({
    where: {
      studentId: { in: studentIds },
      actorId: { not: userId },
      action: {
        in: [
          "ticket.create",
          "ticket.update",
          "ticket.delete",
          "ticket.completion_requested",
        ],
      },
      createdAt: { gt: since },
      ...(dismissed.length > 0 ? { NOT: { entityId: { in: dismissed } } } : {}),
    },
    select: { entityId: true, action: true },
  });
  const ticketIds = Array.from(
    new Set(logs.map((l) => l.entityId).filter((x): x is string => !!x)),
  );
  return { count: logs.length, ticketIds };
}

// ─── calendar ───────────────────────────────────────────────────────────
async function computeCalendar(userId: string, role: Role) {
  const me = await prisma.user.findUnique({
    where: { id: userId },
    select: { calendarLastSeenAt: true },
  });
  const since = me?.calendarLastSeenAt ?? new Date(0);

  const visible = await prisma.student.findMany({
    where: studentVisibilityWhereAllForAdmin(userId, role),
    select: { id: true },
  });
  const studentIds = visible.map((s) => s.id);
  const dismissed = await getDismissedEventIds(userId);

  const logs = await prisma.activityLog.findMany({
    where: {
      OR: [{ studentId: { in: studentIds } }, { studentId: null }],
      actorId: { not: userId },
      action: {
        in: [
          "event.create",
          "event.update",
          "event.delete",
          "availability.create",
        ],
      },
      createdAt: { gt: since },
      ...(dismissed.length > 0 ? { NOT: { entityId: { in: dismissed } } } : {}),
    },
    select: { entityId: true, action: true },
    orderBy: { createdAt: "asc" },
  });

  const highlightByEvent: Record<string, "new" | "updated"> = {};
  for (const l of logs) {
    if (!l.entityId) continue;
    if (l.action === "event.create") highlightByEvent[l.entityId] = "new";
    else if (l.action === "event.update" && !highlightByEvent[l.entityId])
      highlightByEvent[l.entityId] = "updated";
  }
  return { count: logs.length, highlightByEvent };
}

// ─── reading ────────────────────────────────────────────────────────────
async function computeReading(userId: string, role: Role) {
  const me = await prisma.user.findUnique({
    where: { id: userId },
    select: { readingLastSeenAt: true },
  });
  const since = me?.readingLastSeenAt ?? new Date(0);
  const visible = await prisma.student.findMany({
    where: studentVisibilityWhereAllForAdmin(userId, role),
    select: { id: true },
  });
  const studentIds = visible.map((s) => s.id);
  if (studentIds.length === 0) return 0;
  return prisma.activityLog.count({
    where: {
      studentId: { in: studentIds },
      actorId: { not: userId },
      action: {
        in: [
          "reading.create",
          "reading.propose",
          "reading.decision",
          "reading.delete",
        ],
      },
      createdAt: { gt: since },
    },
  });
}

// ─── team ───────────────────────────────────────────────────────────────
async function computeTeam(userId: string, role: Role) {
  const audience =
    isAdmin(role) ||
    (await isSupervisingUser(userId, role)) ||
    (await isTeamAdvisorAnywhere(userId));
  if (!audience) return 0;
  const me = await prisma.user.findUnique({
    where: { id: userId },
    select: { teamSuggestionsLastSeenAt: true },
  });
  const since = me?.teamSuggestionsLastSeenAt ?? new Date(0);
  return prisma.advisorSuggestion.count({
    where: { authorId: { not: userId }, createdAt: { gt: since } },
  });
}

// ─── feedback ───────────────────────────────────────────────────────────
async function computeFeedback(userId: string, role: Role) {
  const me = await prisma.user.findUnique({
    where: { id: userId },
    select: { feedbackLastSeenAt: true },
  });
  const since = me?.feedbackLastSeenAt ?? new Date(0);
  if (isAdmin(role)) {
    const [newSubs, newReplies] = await Promise.all([
      prisma.feedback.count({
        where: { authorId: { not: userId }, createdAt: { gt: since } },
      }),
      prisma.feedbackMessage.count({
        where: { authorId: { not: userId }, createdAt: { gt: since } },
      }),
    ]);
    return newSubs + newReplies;
  }
  const [withLegacyReply, withNewMessage] = await Promise.all([
    prisma.feedback.count({
      where: { authorId: userId, repliedAt: { gt: since } },
    }),
    prisma.feedbackMessage.count({
      where: {
        authorId: { not: userId },
        createdAt: { gt: since },
        feedback: { authorId: userId },
      },
    }),
  ]);
  return withLegacyReply + withNewMessage;
}
