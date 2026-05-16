import { prisma } from "./prisma";
import { calendarForUser } from "./google";
import { parseSubtasks } from "./subtasks";

const TITLE_PREFIX = "[Task] ";
const SUBTASK_PREFIX = "[Sub-task] ";

function googleAllDayBody(title: string, description: string | null, dueDate: Date) {
  // Google all-day events use start.date and end.date (inclusive / exclusive).
  const startDate = dueDate.toISOString().slice(0, 10);
  const nextDay = new Date(dueDate);
  nextDay.setUTCDate(nextDay.getUTCDate() + 1);
  const endDate = nextDay.toISOString().slice(0, 10);
  return {
    summary: `${TITLE_PREFIX}${title}`,
    description: description ?? undefined,
    start: { date: startDate },
    end: { date: endDate },
  };
}

function normalizeCalendarId(id?: string | null): string | null {
  if (!id) return null;
  return id;
}

/**
 * Make the in-app Event row + the Google Calendar event reflect the current
 * state of the given task's due date.
 *
 * - If the task has a due date and no linked event yet → create both.
 * - If the task has a due date and a linked event already → update both.
 * - If the task has no due date → delete both (if a linked event existed).
 *
 * Failures pushing to Google never block the in-app row from being kept in
 * sync; we just log and move on. Callers can swallow rejections.
 */
export async function syncTaskDueEvent(
  taskId: string,
  ownerUserId: string,
): Promise<void> {
  const task = await prisma.ticket.findUnique({
    where: { id: taskId },
    select: {
      id: true,
      title: true,
      description: true,
      dueDate: true,
      studentId: true,
      student: { select: { calendarId: true, email: true } },
      dueEvent: {
        select: {
          id: true,
          googleEventId: true,
          googleCalendarId: true,
        },
      },
    },
  });
  if (!task) return;

  // Case 1: due date cleared → delete linked event everywhere.
  if (!task.dueDate) {
    if (task.dueEvent) {
      await deleteTaskDueEvent(taskId, ownerUserId);
    }
    return;
  }

  const dueDate = task.dueDate;
  const cal = await calendarForUser(ownerUserId);
  const targetCalendarId =
    normalizeCalendarId(task.student?.calendarId) ?? "primary";

  if (!task.dueEvent) {
    // Case 2: no event yet → create both.
    let googleEventId: string | null = null;
    let googleCalendarId: string | null = null;
    if (cal) {
      try {
        const r = await cal.events.insert({
          calendarId: targetCalendarId,
          requestBody: googleAllDayBody(task.title, task.description, dueDate),
          sendUpdates: "none",
        });
        googleEventId = r.data.id ?? null;
        googleCalendarId = targetCalendarId;
      } catch (err) {
        console.error("task→Google event create failed", err);
      }
    }
    // Mid-day UTC anchor so the all-day pill lands on the right local date.
    const anchorStart = new Date(dueDate);
    anchorStart.setUTCHours(12, 0, 0, 0);
    const anchorEnd = new Date(anchorStart);
    anchorEnd.setUTCHours(13, 0, 0, 0);
    await prisma.event.create({
      data: {
        title: `${TITLE_PREFIX}${task.title}`,
        description: task.description,
        startsAt: anchorStart,
        endsAt: anchorEnd,
        allDay: true,
        ownerId: ownerUserId,
        studentId: task.studentId,
        ticketId: task.id,
        googleEventId,
        googleCalendarId,
      },
    });
    return;
  }

  // Case 3: linked event exists → patch both.
  if (cal && task.dueEvent.googleEventId && task.dueEvent.googleCalendarId) {
    try {
      await cal.events.patch({
        calendarId: task.dueEvent.googleCalendarId,
        eventId: task.dueEvent.googleEventId,
        requestBody: googleAllDayBody(task.title, task.description, dueDate),
        sendUpdates: "none",
      });
    } catch (err) {
      console.error("task→Google event patch failed", err);
    }
  }
  const anchorStart = new Date(dueDate);
  anchorStart.setUTCHours(12, 0, 0, 0);
  const anchorEnd = new Date(anchorStart);
  anchorEnd.setUTCHours(13, 0, 0, 0);
  await prisma.event.update({
    where: { id: task.dueEvent.id },
    data: {
      title: `${TITLE_PREFIX}${task.title}`,
      description: task.description,
      startsAt: anchorStart,
      endsAt: anchorEnd,
    },
  });
}

function allDayAnchors(dayIso: string): { startsAt: Date; endsAt: Date } | null {
  // dayIso is "YYYY-MM-DD". Mid-day UTC anchor so the all-day pill lands on
  // the right local date (same trick as task due events).
  const start = new Date(`${dayIso}T12:00:00.000Z`);
  if (Number.isNaN(start.getTime())) return null;
  const end = new Date(start);
  end.setUTCHours(13, 0, 0, 0);
  return { startsAt: start, endsAt: end };
}

/**
 * Mirror each sub-task that has a deadline as an in-app all-day calendar
 * Event titled "[Sub-task] <text> · <task title>". Sub-tasks without a
 * deadline get no event. Events for removed/cleared sub-tasks are pruned.
 *
 * In-app only — these are NOT pushed to Google Calendar (deliberate scope:
 * the requirement is the in-app calendar; keeps the Google surface small).
 */
export async function syncSubtaskDueEvents(
  taskId: string,
  ownerUserId: string,
): Promise<void> {
  const task = await prisma.ticket.findUnique({
    where: { id: taskId },
    select: {
      id: true,
      title: true,
      studentId: true,
      archivedAt: true,
      subtasks: true,
      subtaskDueEvents: { select: { id: true, subtaskKey: true } },
    },
  });
  if (!task) return;

  // Archived (soft-deleted) task → no subtask events at all.
  const subs = task.archivedAt ? [] : parseSubtasks(task.subtasks);
  const withDue = subs.filter((s) => !!s.due);
  const keep = new Set(withDue.map((s) => s.id));

  // Prune events whose subtask is gone or lost its deadline.
  const stale = task.subtaskDueEvents.filter(
    (e) => !e.subtaskKey || !keep.has(e.subtaskKey),
  );
  if (stale.length > 0) {
    await prisma.event.deleteMany({
      where: { id: { in: stale.map((e) => e.id) } },
    });
  }

  // Upsert one event per sub-task-with-deadline.
  for (const s of withDue) {
    const anchors = allDayAnchors(s.due!.slice(0, 10));
    if (!anchors) continue;
    const title = `${SUBTASK_PREFIX}${s.text || "untitled"} · ${task.title}`;
    await prisma.event.upsert({
      where: {
        subtaskParentId_subtaskKey: {
          subtaskParentId: taskId,
          subtaskKey: s.id,
        },
      },
      create: {
        title,
        startsAt: anchors.startsAt,
        endsAt: anchors.endsAt,
        allDay: true,
        ownerId: ownerUserId,
        studentId: task.studentId,
        subtaskParentId: taskId,
        subtaskKey: s.id,
      },
      update: {
        title,
        startsAt: anchors.startsAt,
        endsAt: anchors.endsAt,
        studentId: task.studentId,
      },
    });
  }
}

/** Remove all sub-task deadline events for a task (used on soft-delete). */
export async function deleteSubtaskDueEvents(taskId: string): Promise<void> {
  await prisma.event
    .deleteMany({ where: { subtaskParentId: taskId } })
    .catch(() => {});
}

/**
 * Delete the in-app Event and any Google Calendar event mirroring this task.
 * Must be called BEFORE the Ticket row is deleted, because we need to read
 * googleEventId from the joined event first. The DB row will also be cascaded
 * away on Ticket delete, but we do it explicitly so it's also safe to call
 * from "due date cleared" paths where the Ticket itself survives.
 */
export async function deleteTaskDueEvent(
  taskId: string,
  ownerUserId: string,
): Promise<void> {
  const event = await prisma.event.findUnique({
    where: { ticketId: taskId },
    select: { id: true, googleEventId: true, googleCalendarId: true },
  });
  if (!event) return;
  if (event.googleEventId && event.googleCalendarId) {
    const cal = await calendarForUser(ownerUserId);
    if (cal) {
      try {
        await cal.events.delete({
          calendarId: event.googleCalendarId,
          eventId: event.googleEventId,
          sendUpdates: "none",
        });
      } catch (err) {
        console.error("task→Google event delete failed", err);
      }
    }
  }
  await prisma.event.delete({ where: { id: event.id } }).catch(() => {});
}
