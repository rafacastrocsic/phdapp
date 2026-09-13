import { prisma } from "./prisma";
import { studentVisibilityWhereAllForAdmin, type Role } from "./access";
import { isSeniorTeam, topicVisibilityWhere } from "./discussions-access";

// The "News" window: admin-authored app updates (everyone) + recent data
// activity (access-filtered), shown since the viewer last dismissed it.

export const NEWS_ENABLED_KEY = "newsEnabled";

/** Global on/off toggle (admin). Absent Setting row = enabled. */
export async function isNewsGloballyEnabled(): Promise<boolean> {
  try {
    const row = await prisma.setting.findUnique({ where: { key: NEWS_ENABLED_KEY } });
    return row?.value !== "false";
  } catch {
    return true;
  }
}

// Data-activity actions pulled from the ActivityLog (same source the 🔔 bell
// uses), so News reflects real changes rather than a separate table.
const ACTIONS = [
  "ticket.create",
  "ticket.update",
  "event.create",
  "event.update",
  "reading.create",
  "reading.propose",
  "reading.decision",
  "availability.create",
];

function linkFor(action: string, entityId: string | null): string | null {
  if (action.startsWith("ticket")) return entityId ? `/kanban?ticket=${entityId}` : "/kanban";
  if (action.startsWith("event") || action.startsWith("availability")) return "/calendar";
  if (action.startsWith("reading")) return "/reading";
  return null;
}

const first = (n: string | null | undefined) => n?.split(" ")[0] ?? "Someone";

export interface NewsFeed {
  featureEnabled: boolean; // global admin toggle
  userEnabled: boolean; // per-user opt-in
  show: boolean; // auto-open the window?
  since: string;
  appUpdates: { id: string; title: string; body: string; publishedAt: string }[];
  activity: {
    id: string;
    type: string;
    message: string;
    link: string | null;
    createdAt: string;
  }[];
}

export async function buildNewsFeed(userId: string, role: Role): Promise<NewsFeed> {
  const me = await prisma.user.findUnique({
    where: { id: userId },
    select: { newsLastSeenAt: true, newsEnabled: true },
  });
  const fiveDaysAgo = new Date(Date.now() - 5 * 86_400_000);
  // Since the user last looked; first-timers get the last 5 days.
  const since = me?.newsLastSeenAt ?? fiveDaysAgo;

  const featureEnabled = await isNewsGloballyEnabled();
  const userEnabled = me?.newsEnabled ?? true;
  const senior = await isSeniorTeam(userId, role);

  const visible = await prisma.student.findMany({
    where: studentVisibilityWhereAllForAdmin(userId, role),
    select: { id: true },
  });
  const studentIds = visible.map((s) => s.id);

  // App updates read as a short changelog: show recent ones whenever the
  // window is open (not only unseen), so they don't disappear after one view.
  const appWindow = new Date(Date.now() - 21 * 86_400_000);
  const [appUpdates, logs, topics] = await Promise.all([
    // App updates: visible to everyone.
    prisma.newsPost.findMany({
      where: { publishedAt: { gte: appWindow } },
      orderBy: { publishedAt: "desc" },
      take: 20,
      select: { id: true, title: true, body: true, publishedAt: true },
    }),
    // Data activity: tasks / events / reading / availability, access-filtered.
    prisma.activityLog.findMany({
      where: {
        OR: [{ studentId: { in: studentIds } }, { studentId: null }],
        actorId: { not: userId },
        action: { in: ACTIONS },
        createdAt: { gt: since },
      },
      orderBy: { createdAt: "desc" },
      take: 40,
      include: { actor: { select: { name: true } } },
    }),
    // Discussions: filtered by real topic visibility (team vs supervisors).
    prisma.topic.findMany({
      where: {
        ...topicVisibilityWhere(senior),
        createdAt: { gt: since },
        authorId: { not: userId },
      },
      orderBy: { createdAt: "desc" },
      take: 15,
      include: { author: { select: { name: true } } },
    }),
  ]);

  const activity = [
    ...logs.map((l) => ({
      id: l.id,
      type: l.action,
      message: `${first(l.actor?.name)} ${l.summary}`,
      link: linkFor(l.action, l.entityId),
      createdAt: l.createdAt.toISOString(),
    })),
    ...topics.map((t) => ({
      id: `topic-${t.id}`,
      type: "discussion.create",
      message: `${first(t.author?.name)} started discussion “${t.title}”`,
      link: `/discussions/${t.id}`,
      createdAt: t.createdAt.toISOString(),
    })),
  ]
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    .slice(0, 40);

  // Auto-open only for genuinely new content (unseen app updates or activity);
  // the recent app updates still render when the window is opened on demand.
  const hasUnseenApp = appUpdates.some((p) => p.publishedAt > since);
  return {
    featureEnabled,
    userEnabled,
    show: featureEnabled && userEnabled && (hasUnseenApp || activity.length > 0),
    since: since.toISOString(),
    appUpdates: appUpdates.map((p) => ({
      id: p.id,
      title: p.title,
      body: p.body,
      publishedAt: p.publishedAt.toISOString(),
    })),
    activity,
  };
}
