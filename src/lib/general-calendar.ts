import { prisma } from "./prisma";
import { normalizeCalendarId } from "./calendar-id";

export const GENERAL_CALENDAR_KEY = "generalCalendarId";

/**
 * The Google Calendar that unassigned events / tasks-without-a-shared-
 * student-calendar are pushed to. Admin-configured (Setting row). Returns
 * a normalized calendar id, or null if unset (callers fall back to the
 * actor's "primary").
 */
export async function getGeneralCalendarId(): Promise<string | null> {
  try {
    const row = await prisma.setting.findUnique({
      where: { key: GENERAL_CALENDAR_KEY },
    });
    return normalizeCalendarId(row?.value ?? null);
  } catch {
    return null;
  }
}
