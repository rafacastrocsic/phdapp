import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import {
  teamLevelForStudent,
  canSeeSupervisorPrivate,
  type Role,
} from "@/lib/access";
import { displayName, relativeTime } from "@/lib/utils";
import { STATUSES, PRIORITIES } from "@/lib/kanban-constants";
import { format } from "date-fns";

const sLabel = (id: string) =>
  STATUSES.find((s) => s.id === id)?.label ?? id;
const pLabel = (id: string) =>
  PRIORITIES.find((p) => p.id === id)?.label ?? id;
const dayMs = 86_400_000;

/**
 * Read-only "catch up on this student" text digest — tasks, events, thesis,
 * publications, latest check-in. Non-students with visibility only.
 */
export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await auth();
  if (!session?.user)
    return NextResponse.json({ error: "unauth" }, { status: 401 });
  const { id } = await params;
  const role = session.user.role as Role;

  const level = await teamLevelForStudent(id, session.user.id, role);
  if (role === "student" || level === null || level === "self")
    return NextResponse.json({ error: "forbidden" }, { status: 403 });

  const student = await prisma.student.findUnique({
    where: { id },
    select: { fullName: true, alias: true },
  });
  if (!student)
    return NextResponse.json({ error: "not found" }, { status: 404 });

  // Origin used to build deep-links into the app. Comes from the
  // request URL so it matches whichever Vercel deploy is serving
  // (no env var needed).
  const origin = new URL(req.url).origin;

  const now = new Date();
  const [tickets, events, recentTickets, recentEvents, chapters, pubs, checkin] =
    await Promise.all([
      prisma.ticket.findMany({
        where: { studentId: id, archivedAt: null },
        select: {
          title: true,
          status: true,
          priority: true,
          dueDate: true,
          completedAt: true,
        },
        orderBy: [{ dueDate: "asc" }],
      }),
      prisma.event.findMany({
        where: { studentId: id, ticketId: null, subtaskParentId: null },
        select: { title: true, startsAt: true, isMeeting: true },
        orderBy: { startsAt: "asc" },
      }),
      // RECENTLY UPDATED tasks — separate query (different ordering)
      // so we don't disturb the existing "active / overdue / etc."
      // groupings above. Includes a small slice of the most recent
      // comments per task so the digest carries the conversation
      // context, not just the task title.
      prisma.ticket.findMany({
        where: { studentId: id, archivedAt: null },
        orderBy: [{ updatedAt: "desc" }],
        take: 6,
        select: {
          id: true,
          title: true,
          status: true,
          priority: true,
          updatedAt: true,
          _count: { select: { comments: true } },
          comments: {
            orderBy: { createdAt: "desc" },
            take: 2,
            select: {
              body: true,
              createdAt: true,
              author: { select: { name: true, email: true } },
            },
          },
        },
      }),
      // RECENTLY UPDATED events (excluding task-mirror events).
      prisma.event.findMany({
        where: { studentId: id, ticketId: null, subtaskParentId: null },
        orderBy: [{ updatedAt: "desc" }],
        take: 3,
        select: {
          id: true,
          title: true,
          startsAt: true,
          updatedAt: true,
          isMeeting: true,
          _count: { select: { comments: true } },
          comments: {
            orderBy: { createdAt: "desc" },
            take: 1,
            select: {
              body: true,
              createdAt: true,
              author: { select: { name: true, email: true } },
            },
          },
        },
      }),
    prisma.thesisChapter.findMany({
      where: { studentId: id },
      select: { status: true },
    }),
    prisma.publication.findMany({
      where: { studentId: id },
      select: { status: true },
    }),
    prisma.checkIn.findFirst({
      where: { studentId: id },
      orderBy: { weekOf: "desc" },
    }),
  ]);

  const active = tickets.filter((t) => t.status !== "done");
  const inProgress = active.filter((t) => t.status === "in_progress");
  const blocked = active.filter((t) => t.status === "blocked");
  const overdue = active.filter(
    (t) => t.dueDate && t.dueDate < now,
  );
  const upcoming = active.filter(
    (t) =>
      t.dueDate && t.dueDate >= now && t.dueDate <= new Date(+now + 14 * dayMs),
  );
  const todo = active.filter(
    (t) => t.status === "todo" || t.status === "backlog",
  );
  const doneRecently = tickets.filter(
    (t) =>
      t.status === "done" &&
      t.completedAt &&
      t.completedAt >= new Date(+now - 14 * dayMs),
  );

  const fmtTask = (t: (typeof tickets)[number]) => {
    const bits: string[] = [pLabel(t.priority)];
    if (t.dueDate) {
      const days = Math.round((+t.dueDate - +now) / dayMs);
      bits.push(
        t.dueDate < now
          ? `overdue ${Math.abs(days)}d`
          : `due ${format(t.dueDate, "MMM d")}`,
      );
    }
    return `  • ${t.title} (${bits.join(", ")})`;
  };

  // ───── Comment-body truncation for inline quotes ─────
  // Comments can be long; in the digest we just want enough to know
  // what they're about. Wrap at ~140 chars to keep one comment to ~2
  // lines in the dialog.
  const quote = (body: string): string => {
    const s = body.trim().replace(/\s+/g, " ");
    return s.length > 140 ? s.slice(0, 137).trimEnd() + "…" : s;
  };
  const authorName = (a: { name: string | null; email: string }) =>
    a.name?.trim() || a.email;

  const L: string[] = [];
  L.push(`Catch-up — ${displayName(student)}`);
  L.push(`As of ${format(now, "EEE d MMM yyyy, HH:mm")}`);

  // ───── RECENTLY UPDATED ─────
  // Top-of-digest "what changed lately" block, so a supervisor sees
  // the freshest activity (recently moved/commented tasks, rescheduled
  // events) before diving into the breakdown below. Each task line
  // includes a kanban deep link that opens the task dialog directly.
  if (recentTickets.length || recentEvents.length) {
    L.push("");
    L.push("RECENTLY UPDATED");
    if (recentTickets.length) {
      L.push("");
      L.push("Tasks (most recent activity first):");
      for (const t of recentTickets) {
        const meta: string[] = [sLabel(t.status), pLabel(t.priority)];
        meta.push(
          `${t._count.comments} comment${t._count.comments === 1 ? "" : "s"}`,
        );
        meta.push(`updated ${relativeTime(t.updatedAt)}`);
        L.push(`  • ${t.title} — ${meta.join(", ")}`);
        L.push(`    ${origin}/kanban?student=${id}&ticket=${t.id}`);
        // Most recent comments (newest first), 2 max — gives the
        // gist of the conversation without dumping the whole thread.
        for (const c of t.comments) {
          L.push(
            `    ${authorName(c.author)} (${relativeTime(c.createdAt)}): “${quote(c.body)}”`,
          );
        }
      }
    }
    if (recentEvents.length) {
      L.push("");
      L.push("Events (most recent activity first):");
      for (const e of recentEvents) {
        const meta: string[] = [
          format(e.startsAt, "EEE MMM d, HH:mm"),
        ];
        if (e.isMeeting) meta.push("meeting");
        if (e._count.comments > 0)
          meta.push(
            `${e._count.comments} comment${e._count.comments === 1 ? "" : "s"}`,
          );
        meta.push(`updated ${relativeTime(e.updatedAt)}`);
        L.push(`  • ${e.title} — ${meta.join(", ")}`);
        // No per-event deep link (calendar page doesn't accept an
        // event id in the query string), so we link to the
        // calendar filtered to this student instead.
        L.push(`    ${origin}/calendar?student=${id}`);
        for (const c of e.comments) {
          L.push(
            `    ${authorName(c.author)} (${relativeTime(c.createdAt)}): “${quote(c.body)}”`,
          );
        }
      }
    }
  }

  L.push("");
  L.push(
    `TASKS: ${active.length} active · ${inProgress.length} in progress · ` +
      `${overdue.length} overdue · ${doneRecently.length} done in last 14d`,
  );
  if (inProgress.length) {
    L.push("");
    L.push("In progress now:");
    inProgress.slice(0, 12).forEach((t) => L.push(fmtTask(t)));
  }
  if (overdue.length) {
    L.push("");
    L.push("Overdue (needs attention):");
    overdue.slice(0, 12).forEach((t) => L.push(fmtTask(t)));
  }
  if (blocked.length) {
    L.push("");
    L.push("Blocked (waiting on dependencies):");
    blocked.slice(0, 12).forEach((t) => L.push(fmtTask(t)));
  }
  if (upcoming.length) {
    L.push("");
    L.push("Due in the next 2 weeks:");
    upcoming.slice(0, 12).forEach((t) => L.push(fmtTask(t)));
  }
  if (todo.length) {
    L.push("");
    L.push(
      `Not started yet: ${todo.length} task${todo.length === 1 ? "" : "s"}` +
        (todo.length
          ? ` — e.g. ${todo
              .slice(0, 4)
              .map((t) => t.title)
              .join("; ")}`
          : ""),
    );
  }
  if (doneRecently.length) {
    L.push("");
    L.push("Recently completed:");
    doneRecently
      .slice(0, 10)
      .forEach((t) =>
        L.push(
          `  • ${t.title}${
            t.completedAt ? ` (${format(t.completedAt, "MMM d")})` : ""
          }`,
        ),
      );
  }

  const futureEv = events.filter((e) => e.startsAt >= now);
  const pastEv = events
    .filter((e) => e.startsAt < now)
    .sort((a, b) => +b.startsAt - +a.startsAt);
  L.push("");
  L.push(
    `EVENTS: ${futureEv.length} upcoming · ${pastEv.length} past (calendar events; task deadlines not counted)`,
  );
  if (futureEv.length) {
    L.push("");
    L.push("Next up:");
    futureEv
      .slice(0, 6)
      .forEach((e) =>
        L.push(
          `  • ${format(e.startsAt, "EEE MMM d, HH:mm")} — ${e.title}${
            e.isMeeting ? " (meeting)" : ""
          }`,
        ),
      );
  }
  if (pastEv.length) {
    L.push("");
    L.push("Recent:");
    pastEv
      .slice(0, 4)
      .forEach((e) =>
        L.push(`  • ${format(e.startsAt, "MMM d")} — ${e.title}`),
      );
  }

  if (chapters.length) {
    const by: Record<string, number> = {};
    for (const c of chapters) by[c.status] = (by[c.status] ?? 0) + 1;
    L.push("");
    L.push(
      `THESIS: ${chapters.length} chapter${chapters.length === 1 ? "" : "s"} — ` +
        Object.entries(by)
          .map(([k, v]) => `${v} ${k.replace("_", " ")}`)
          .join(", "),
    );
  }
  if (pubs.length) {
    const by: Record<string, number> = {};
    for (const p of pubs) by[p.status] = (by[p.status] ?? 0) + 1;
    L.push("");
    L.push(
      `PUBLICATIONS: ${pubs.length} — ` +
        Object.entries(by)
          .map(([k, v]) => `${v} ${k.replace("_", " ")}`)
          .join(", "),
    );
  }

  if (checkin) {
    L.push("");
    L.push(`LATEST CHECK-IN (week of ${format(checkin.weekOf, "MMM d")}):`);
    if (checkin.did) L.push(`  Did: ${checkin.did}`);
    if (checkin.blockers) L.push(`  Blockers: ${checkin.blockers}`);
    if (checkin.next) L.push(`  Next: ${checkin.next}`);
    if (checkin.wellbeing != null && canSeeSupervisorPrivate(level))
      L.push(`  Wellbeing: ${checkin.wellbeing}/5`);
  } else {
    L.push("");
    L.push("LATEST CHECK-IN: none submitted yet.");
  }

  return NextResponse.json({
    text: L.join("\n"),
    generatedAt: now.toISOString(),
  });
}
