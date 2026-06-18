import { prisma } from "@/lib/prisma";

/**
 * Adoption / usage metrics for the admin dashboard (/admin/metrics).
 *
 * Everything here is derived from data PhDapp already stores — there
 * is no separate analytics/event-tracking table. The main signals:
 *   - User.lastActiveAt  → bumped on every authenticated page render
 *     (throttled to ~5 min), so it doubles as "has signed in" (non-
 *     null) and "active recency".
 *   - createdAt / completedAt timestamps on every model → volume +
 *     time-series + throughput.
 *
 * All windows are relative to "now" at call time.
 */

const DAY = 86_400_000;

function median(nums: number[]): number | null {
  if (nums.length === 0) return null;
  const s = [...nums].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid]! : (s[mid - 1]! + s[mid]!) / 2;
}

export interface Metrics {
  generatedAt: string;
  // 1 — active users
  users: {
    total: number; // all User rows (invited or not)
    everSignedIn: number; // lastActiveAt non-null
    activeToday: number;
    wau: number; // active in last 7d
    mau: number; // active in last 30d
    stickiness: number | null; // wau / mau, 0..1
  };
  // 2 — adoption by role
  byRole: {
    role: string;
    total: number;
    signedIn: number;
    active30: number;
  }[];
  // 3 — module engagement (distinct active people per module, 30d)
  modules: { key: string; label: string; users: number }[];
  // 4 — tasks
  tasks: {
    totalLive: number;
    created30: number;
    completed30: number;
    completionRatePct: number | null; // done / (done + open), all live
    medianDaysToComplete: number | null;
  };
  // 5 — chat
  chat: {
    messages30: number;
    messages7: number;
    activeChannels30: number;
    totalChannels: number;
    studentsMessagingPct: number | null; // % students with ≥1 msg in 30d
  };
  // 6 — reading
  reading: {
    total: number;
    proposedByStudents: number;
    addedBySupervisors: number;
    medianApprovalHours: number | null;
  };
  // 7 — meetings with substance
  meetings: {
    total: number;
    withNotesOrAgenda: number;
    pctWithNotes: number | null;
  };
  // 8 — weekly check-ins
  checkins: {
    activeStudents: number;
    last4wReceived: number;
    last4wExpected: number;
    submissionRatePct: number | null;
    avgWellbeing: number | null; // last 4w
  };
  // 9 — resources consolidated
  resources: {
    studentsWithDrive: number;
    totalStudents: number;
    thesisChapters: number;
    publications: number;
    starredFiles: number;
  };
  // 10 — engagement recency distribution (of users who ever signed in)
  recency: {
    today: number;
    thisWeek: number; // 1–7d
    thisMonth: number; // 8–30d
    older: number; // >30d
    neverSignedIn: number;
  };
}

export async function computeMetrics(): Promise<Metrics> {
  const now = new Date();
  const d7 = new Date(+now - 7 * DAY);
  const d30 = new Date(+now - 30 * DAY);
  const d28 = new Date(+now - 28 * DAY); // 4 full weeks
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());

  // ── Users (pull the lightweight fields once, derive in JS) ──
  const allUsers = await prisma.user.findMany({
    select: { id: true, role: true, lastActiveAt: true },
  });
  const signedIn = allUsers.filter((u) => u.lastActiveAt);
  const isAfter = (d: Date | null, ref: Date) => !!d && d >= ref;

  const users: Metrics["users"] = {
    total: allUsers.length,
    everSignedIn: signedIn.length,
    activeToday: allUsers.filter((u) => isAfter(u.lastActiveAt, todayStart))
      .length,
    wau: allUsers.filter((u) => isAfter(u.lastActiveAt, d7)).length,
    mau: allUsers.filter((u) => isAfter(u.lastActiveAt, d30)).length,
    stickiness: null,
  };
  users.stickiness = users.mau > 0 ? users.wau / users.mau : null;

  // ── By role ──
  const roleOrder = ["admin", "supervisor", "student"];
  const roles = Array.from(
    new Set([...roleOrder, ...allUsers.map((u) => u.role)]),
  );
  const byRole = roles
    .map((role) => {
      const rows = allUsers.filter((u) => u.role === role);
      return {
        role,
        total: rows.length,
        signedIn: rows.filter((u) => u.lastActiveAt).length,
        active30: rows.filter((u) => isAfter(u.lastActiveAt, d30)).length,
      };
    })
    .filter((r) => r.total > 0);

  // ── Module engagement: distinct active people per module (30d) ──
  // Each module's "did something" signal is a created/authored row
  // since d30. We count distinct user/author ids.
  const [
    taskActors,
    eventActors,
    msgActors,
    readingActors,
    commentActors,
    checkinActors,
  ] = await Promise.all([
    prisma.ticket.findMany({
      where: { createdAt: { gte: d30 } },
      select: { createdById: true },
      distinct: ["createdById"],
    }),
    prisma.event.findMany({
      where: { createdAt: { gte: d30 } },
      select: { ownerId: true },
      distinct: ["ownerId"],
    }),
    prisma.message.findMany({
      where: { createdAt: { gte: d30 } },
      select: { authorId: true },
      distinct: ["authorId"],
    }),
    prisma.readingItem.findMany({
      where: { createdAt: { gte: d30 } },
      select: { addedById: true },
      distinct: ["addedById"],
    }),
    prisma.comment.findMany({
      where: { createdAt: { gte: d30 } },
      select: { authorId: true },
      distinct: ["authorId"],
    }),
    prisma.checkIn.findMany({
      where: { createdAt: { gte: d30 }, student: { userId: { not: null } } },
      select: { student: { select: { userId: true } } },
    }),
  ]);
  const modules: Metrics["modules"] = [
    { key: "tasks", label: "Tasks", users: taskActors.length },
    { key: "calendar", label: "Calendar", users: eventActors.length },
    { key: "chat", label: "Chat", users: msgActors.length },
    { key: "reading", label: "Reading", users: readingActors.length },
    { key: "comments", label: "Comments", users: commentActors.length },
    {
      key: "checkins",
      label: "Check-ins",
      users: new Set(
        checkinActors.map((c) => c.student?.userId).filter(Boolean),
      ).size,
    },
  ];

  // ── Tasks ──
  const [tasksTotalLive, tasksCreated30, tasksCompleted30, doneCount] =
    await Promise.all([
      prisma.ticket.count({ where: { archivedAt: null } }),
      prisma.ticket.count({
        where: { archivedAt: null, createdAt: { gte: d30 } },
      }),
      prisma.ticket.count({
        where: { archivedAt: null, completedAt: { gte: d30 } },
      }),
      prisma.ticket.count({ where: { archivedAt: null, status: "done" } }),
    ]);
  const completedForMedian = await prisma.ticket.findMany({
    where: { archivedAt: null, completedAt: { not: null } },
    select: { createdAt: true, completedAt: true },
    take: 2000,
  });
  const tasks: Metrics["tasks"] = {
    totalLive: tasksTotalLive,
    created30: tasksCreated30,
    completed30: tasksCompleted30,
    completionRatePct:
      tasksTotalLive > 0 ? Math.round((doneCount / tasksTotalLive) * 100) : null,
    medianDaysToComplete: (() => {
      const days = completedForMedian
        .map((t) =>
          t.completedAt ? (+t.completedAt - +t.createdAt) / DAY : null,
        )
        .filter((x): x is number => x !== null && x >= 0);
      const m = median(days);
      return m === null ? null : Math.round(m * 10) / 10;
    })(),
  };

  // ── Chat ──
  const [messages30, messages7, totalChannels, activeChannelRows] =
    await Promise.all([
      prisma.message.count({ where: { createdAt: { gte: d30 } } }),
      prisma.message.count({ where: { createdAt: { gte: d7 } } }),
      prisma.channel.count(),
      prisma.message.findMany({
        where: { createdAt: { gte: d30 } },
        select: { channelId: true },
        distinct: ["channelId"],
      }),
    ]);
  // Students who exchanged ≥1 message in the last 30d (any channel).
  const totalStudents = await prisma.student.count();
  const studentUserIds = (
    await prisma.student.findMany({
      where: { userId: { not: null } },
      select: { userId: true },
    })
  )
    .map((s) => s.userId)
    .filter((x): x is string => !!x);
  const messagingStudents = await prisma.message.findMany({
    where: { createdAt: { gte: d30 }, authorId: { in: studentUserIds } },
    select: { authorId: true },
    distinct: ["authorId"],
  });
  const chat: Metrics["chat"] = {
    messages30,
    messages7,
    activeChannels30: activeChannelRows.length,
    totalChannels,
    studentsMessagingPct:
      totalStudents > 0
        ? Math.round((messagingStudents.length / totalStudents) * 100)
        : null,
  };

  // ── Reading ──
  const [readingTotal, readingProposed, readingAdded] = await Promise.all([
    prisma.readingItem.count(),
    prisma.readingItem.count({ where: { proposedByStudent: true } }),
    prisma.readingItem.count({ where: { proposedByStudent: false } }),
  ]);
  // Approval turnaround: proposed items that reached a decision. We
  // don't store a decision timestamp separately, so use updatedAt on
  // rows that were student-proposed and are now approved/rejected as
  // a proxy for "time to decision".
  const decided = await prisma.readingItem.findMany({
    where: {
      proposedByStudent: true,
      status: { in: ["approved", "rejected", "reading", "done"] },
      decisionById: { not: null },
    },
    select: { createdAt: true, updatedAt: true },
    take: 1000,
  });
  const reading: Metrics["reading"] = {
    total: readingTotal,
    proposedByStudents: readingProposed,
    addedBySupervisors: readingAdded,
    medianApprovalHours: (() => {
      const hrs = decided
        .map((r) => (+r.updatedAt - +r.createdAt) / 3_600_000)
        .filter((x) => x >= 0);
      const m = median(hrs);
      return m === null ? null : Math.round(m * 10) / 10;
    })(),
  };

  // ── Meetings with substance ──
  // A meeting "with notes" has a non-empty meetingNotes OR an agenda
  // with at least one item (agenda is a JSON array string).
  const allMeetings = await prisma.event.findMany({
    where: { isMeeting: true },
    select: { meetingNotes: true, agenda: true },
  });
  const withNotes = allMeetings.filter((m) => {
    const hasNotes = !!m.meetingNotes && m.meetingNotes.trim().length > 0;
    let hasAgenda = false;
    if (m.agenda) {
      try {
        const arr = JSON.parse(m.agenda);
        hasAgenda = Array.isArray(arr) && arr.length > 0;
      } catch {
        hasAgenda = m.agenda.trim().length > 0;
      }
    }
    return hasNotes || hasAgenda;
  }).length;
  const meetings: Metrics["meetings"] = {
    total: allMeetings.length,
    withNotesOrAgenda: withNotes,
    pctWithNotes:
      allMeetings.length > 0
        ? Math.round((withNotes / allMeetings.length) * 100)
        : null,
  };

  // ── Weekly check-ins ──
  // Active students = students whose linked user signed in in last 30d
  // (fall back to all students if none have user links yet).
  const activeStudents = await prisma.student.count({
    where: { user: { lastActiveAt: { gte: d30 } } },
  });
  const checkinDenomStudents = activeStudents || totalStudents;
  const last4wReceived = await prisma.checkIn.count({
    where: { weekOf: { gte: d28 } },
  });
  const wellbeingRows = await prisma.checkIn.findMany({
    where: { weekOf: { gte: d28 }, wellbeing: { not: null } },
    select: { wellbeing: true },
  });
  const expected = checkinDenomStudents * 4;
  const checkins: Metrics["checkins"] = {
    activeStudents: checkinDenomStudents,
    last4wReceived,
    last4wExpected: expected,
    submissionRatePct:
      expected > 0
        ? Math.min(100, Math.round((last4wReceived / expected) * 100))
        : null,
    avgWellbeing: (() => {
      const vals = wellbeingRows
        .map((w) => w.wellbeing)
        .filter((x): x is number => x !== null);
      if (vals.length === 0) return null;
      return Math.round((vals.reduce((a, b) => a + b, 0) / vals.length) * 10) / 10;
    })(),
  };

  // ── Resources consolidated ──
  const [studentsWithDrive, thesisChapters, publications, starredFiles] =
    await Promise.all([
      prisma.student.count({ where: { driveFolderId: { not: null } } }),
      prisma.thesisChapter.count(),
      prisma.publication.count(),
      prisma.favoriteFile.count(),
    ]);
  const resources: Metrics["resources"] = {
    studentsWithDrive,
    totalStudents,
    thesisChapters,
    publications,
    starredFiles,
  };

  // ── Engagement recency ──
  const recency: Metrics["recency"] = {
    today: allUsers.filter((u) => isAfter(u.lastActiveAt, todayStart)).length,
    thisWeek: allUsers.filter(
      (u) =>
        u.lastActiveAt && u.lastActiveAt >= d7 && u.lastActiveAt < todayStart,
    ).length,
    thisMonth: allUsers.filter(
      (u) => u.lastActiveAt && u.lastActiveAt >= d30 && u.lastActiveAt < d7,
    ).length,
    older: allUsers.filter((u) => u.lastActiveAt && u.lastActiveAt < d30).length,
    neverSignedIn: allUsers.filter((u) => !u.lastActiveAt).length,
  };

  return {
    generatedAt: now.toISOString(),
    users,
    byRole,
    modules,
    tasks,
    chat,
    reading,
    meetings,
    checkins,
    resources,
    recency,
  };
}
