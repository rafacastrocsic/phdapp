import { prisma } from "./prisma";
import { calendarForUser } from "./google";

const TITLE_PREFIX = "[Task] ";

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
