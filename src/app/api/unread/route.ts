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
import {
  computeUnreadByChannel,
  visibleChannelIdsForUser,
} from "@/lib/chat-access";
import { getDismissedTicketIds } from "@/lib/kanban-dismissed";
import { getDismissedEventIds } from "@/lib/calendar-dismissed";

// Aggregated unread-counts endpoint.
//
// Why: the sidebar (and the chat tab-title alert) used to fire six
// independent unread fetches every ~5 seconds, which dominated this
// project's Vercel function-invocation usage. This single endpoint
// runs all six lookups in parallel inside one function invocation
// and returns them in one shape, so the client can poll exactly
// once per tick.
//
// Each section also carries a `version` field — the ISO timestamp of
// the most recent change visible to this user, made by someone OTHER
// than them. The page-level views use this as a polling gate: they
// only re-fetch their full data when the version they care about
// actually moves. When no teammate has done anything, the version
// stays put, and pages skip their refresh entirely. Self-changes
// never bump the version (they're already reflected client-side via
// optimistic updates).
//
// Response shape kept compatible with the previous per-module GETs so
// that consumers (sidebar, chat-view, tab-alerts) can read the same
// fields they already know.
export async function GET() {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({
      chat: { count: 0, byChannel: {}, latestSender: null, version: null },
      kanban: { count: 0, ticketIds: [], version: null },
      calendar: { count: 0, highlightByEvent: {}, version: null },
      reading: { count: 0, version: null },
      team: { count: 0, version: null },
      feedback: { count: 0, version: null },
      serverNow: new Date().toISOString(),
    });
  }
  const userId = session.user.id;
  const role = session.user.role as Role;

  const [
    chatBlob,
    kanbanBlob,
    calendarBlob,
    readingBlob,
    teamBlob,
    feedbackBlob,
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
    reading: readingBlob,
    team: teamBlob,
    feedback: feedbackBlob,
    serverNow: new Date().toISOString(),
  });
}

// Take the larger of two nullable ISO strings (used to combine
// createdAt and editedAt aggregates into a single version).
function maxIso(a: string | null, b: string | null): string | null {
  if (!a) return b;
  if (!b) return a;
  return a >= b ? a : b;
}

// ─── chat ───────────────────────────────────────────────────────────────
async function computeChat(userId: string) {
  // Version = max of (Message.createdAt, Message.editedAt) across
  // visible channels for messages NOT authored by this user. Edited
  // messages also tick the version so peers see edits in real time.
  const channelIds = await visibleChannelIdsForUser(userId);

  const [unread, versionParts] = await Promise.all([
    computeUnreadByChannel(userId),
    channelIds.length === 0
      ? Promise.resolve([{ _max: { createdAt: null, editedAt: null } }])
      : Promise.all([
          prisma.message.aggregate({
            where: { channelId: { in: channelIds }, authorId: { not: userId } },
            _max: { createdAt: true, editedAt: true },
          }),
        ]),
  ]);

  const { total, byChannel } = unread;
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
      if (msg && msg.createdAt > (lastRead.get(msg.channelId) ?? new Date(0)))
        latestSender = msg.author?.name ?? null;
    }
  }

  const agg = versionParts[0];
  const version = maxIso(
    agg._max.createdAt ? agg._max.createdAt.toISOString() : null,
    agg._max.editedAt ? agg._max.editedAt.toISOString() : null,
  );

  return { count: total, byChannel, latestSender, version };
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
  if (studentIds.length === 0)
    return { count: 0, ticketIds: [] as string[], version: null };

  const dismissed = await getDismissedTicketIds(userId);
  // Action set shared by both the count query (filtered by since +
  // not-dismissed) and the version query (no time filter — gives
  // the "most recent peer activity in scope" stamp).
  const kanbanActions = [
    "ticket.create",
    "ticket.update",
    "ticket.delete",
    "ticket.completion_requested",
  ];

  const [logs, versionAgg] = await Promise.all([
    prisma.activityLog.findMany({
      where: {
        studentId: { in: studentIds },
        actorId: { not: userId },
        action: { in: kanbanActions },
        createdAt: { gt: since },
        ...(dismissed.length > 0
          ? { NOT: { entityId: { in: dismissed } } }
          : {}),
      },
      select: { entityId: true, action: true },
    }),
    prisma.activityLog.aggregate({
      where: {
        studentId: { in: studentIds },
        actorId: { not: userId },
        action: { in: kanbanActions },
      },
      _max: { createdAt: true },
    }),
  ]);

  const ticketIds = Array.from(
    new Set(logs.map((l) => l.entityId).filter((x): x is string => !!x)),
  );
  const version = versionAgg._max.createdAt
    ? versionAgg._max.createdAt.toISOString()
    : null;
  return { count: logs.length, ticketIds, version };
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

  const calendarActions = [
    "event.create",
    "event.update",
    "event.delete",
    "availability.create",
  ];

  const [logs, versionAgg] = await Promise.all([
    prisma.activityLog.findMany({
      where: {
        OR: [{ studentId: { in: studentIds } }, { studentId: null }],
        actorId: { not: userId },
        action: { in: calendarActions },
        createdAt: { gt: since },
        ...(dismissed.length > 0
          ? { NOT: { entityId: { in: dismissed } } }
          : {}),
      },
      select: { entityId: true, action: true },
      orderBy: { createdAt: "asc" },
    }),
    prisma.activityLog.aggregate({
      where: {
        OR: [{ studentId: { in: studentIds } }, { studentId: null }],
        actorId: { not: userId },
        action: { in: calendarActions },
      },
      _max: { createdAt: true },
    }),
  ]);

  const highlightByEvent: Record<string, "new" | "updated"> = {};
  for (const l of logs) {
    if (!l.entityId) continue;
    if (l.action === "event.create") highlightByEvent[l.entityId] = "new";
    else if (l.action === "event.update" && !highlightByEvent[l.entityId])
      highlightByEvent[l.entityId] = "updated";
  }
  const version = versionAgg._max.createdAt
    ? versionAgg._max.createdAt.toISOString()
    : null;
  return { count: logs.length, highlightByEvent, version };
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
  if (studentIds.length === 0) return { count: 0, version: null };

  const readingActions = [
    "reading.create",
    "reading.propose",
    "reading.decision",
    "reading.delete",
    "reading.comment",
  ];

  const [count, versionAgg] = await Promise.all([
    prisma.activityLog.count({
      where: {
        studentId: { in: studentIds },
        actorId: { not: userId },
        action: { in: readingActions },
        createdAt: { gt: since },
      },
    }),
    prisma.activityLog.aggregate({
      where: {
        studentId: { in: studentIds },
        actorId: { not: userId },
        action: { in: readingActions },
      },
      _max: { createdAt: true },
    }),
  ]);
  return {
    count,
    version: versionAgg._max.createdAt
      ? versionAgg._max.createdAt.toISOString()
      : null,
  };
}

// ─── team ───────────────────────────────────────────────────────────────
async function computeTeam(userId: string, role: Role) {
  const audience =
    isAdmin(role) ||
    (await isSupervisingUser(userId, role)) ||
    (await isTeamAdvisorAnywhere(userId));
  if (!audience) return { count: 0, version: null };
  const me = await prisma.user.findUnique({
    where: { id: userId },
    select: { teamSuggestionsLastSeenAt: true },
  });
  const since = me?.teamSuggestionsLastSeenAt ?? new Date(0);

  const [count, versionAgg] = await Promise.all([
    prisma.advisorSuggestion.count({
      where: { authorId: { not: userId }, createdAt: { gt: since } },
    }),
    prisma.advisorSuggestion.aggregate({
      where: { authorId: { not: userId } },
      _max: { createdAt: true },
    }),
  ]);
  return {
    count,
    version: versionAgg._max.createdAt
      ? versionAgg._max.createdAt.toISOString()
      : null,
  };
}

// ─── feedback ───────────────────────────────────────────────────────────
async function computeFeedback(userId: string, role: Role) {
  const me = await prisma.user.findUnique({
    where: { id: userId },
    select: { feedbackLastSeenAt: true },
  });
  const since = me?.feedbackLastSeenAt ?? new Date(0);

  if (isAdmin(role)) {
    const [newSubs, newReplies, subAgg, replyAgg] = await Promise.all([
      prisma.feedback.count({
        where: { authorId: { not: userId }, createdAt: { gt: since } },
      }),
      prisma.feedbackMessage.count({
        where: { authorId: { not: userId }, createdAt: { gt: since } },
      }),
      prisma.feedback.aggregate({
        where: { authorId: { not: userId } },
        _max: { createdAt: true },
      }),
      prisma.feedbackMessage.aggregate({
        where: { authorId: { not: userId } },
        _max: { createdAt: true },
      }),
    ]);
    const version = maxIso(
      subAgg._max.createdAt ? subAgg._max.createdAt.toISOString() : null,
      replyAgg._max.createdAt ? replyAgg._max.createdAt.toISOString() : null,
    );
    return { count: newSubs + newReplies, version };
  }
  const [withLegacyReply, withNewMessage, replyAgg, msgAgg] = await Promise.all([
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
    prisma.feedback.aggregate({
      where: { authorId: userId },
      _max: { repliedAt: true },
    }),
    prisma.feedbackMessage.aggregate({
      where: {
        authorId: { not: userId },
        feedback: { authorId: userId },
      },
      _max: { createdAt: true },
    }),
  ]);
  const version = maxIso(
    replyAgg._max.repliedAt ? replyAgg._max.repliedAt.toISOString() : null,
    msgAgg._max.createdAt ? msgAgg._max.createdAt.toISOString() : null,
  );
  return { count: withLegacyReply + withNewMessage, version };
}
