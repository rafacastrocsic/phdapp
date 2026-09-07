import { prisma } from "./prisma";
import { calendarForUser } from "./google";
import { isSeniorTeam } from "./discussions-access";
import { type Role } from "./access";

/**
 * Read the Google events from Project Researchers' own workspace calendars so
 * they can be shown (read-only) inside PhDapp's Calendar module. A researcher's
 * calendar is visible to the whole senior team and to the students they work
 * with, so:
 *   - senior-team viewers see every researcher's calendar;
 *   - a student sees the calendars of researchers assigned to them;
 *   - anyone else sees none.
 *
 * Each returned item matches the calendar's client `Event` shape, tagged
 * `external: true` and carrying a synthetic `student` so it renders in the
 * owner's colour with their name as the label. Best-effort: a calendar that
 * fails to read is skipped rather than breaking the page.
 */
export interface ExternalCalEvent {
  id: string;
  title: string;
  description: string | null;
  location: string | null;
  startsAt: string;
  endsAt: string;
  allDay: boolean;
  external: true;
  ownerName: string;
  student: { id: string; fullName: string; alias: string | null; color: string };
}

type ResearcherRow = {
  id: string;
  name: string | null;
  color: string;
  calendarId: string | null;
  driveFolderId?: string | null;
  coSupervisedStudents: { studentId: string }[];
};

/**
 * Project researchers whose workspace the given viewer may see: senior-team
 * viewers see all; a student sees researchers assigned to them; nobody else.
 * The viewer's own row is dropped.
 */
async function visibleResearchers(
  viewerId: string,
  role: Role,
  extraSelect: { driveFolderId?: boolean } = {},
): Promise<ResearcherRow[]> {
  const researchers = (await prisma.user.findMany({
    where: {
      coSupervisedStudents: { some: { role: "project_researcher" } },
    },
    select: {
      id: true,
      name: true,
      color: true,
      calendarId: true,
      ...(extraSelect.driveFolderId ? { driveFolderId: true } : {}),
      coSupervisedStudents: {
        where: { role: "project_researcher" },
        select: { studentId: true },
      },
    },
  })) as ResearcherRow[];
  if (researchers.length === 0) return [];

  let visible = researchers;
  if (await isSeniorTeam(viewerId, role)) {
    // all
  } else if (role === "student") {
    const me = await prisma.student.findFirst({
      where: { userId: viewerId },
      select: { id: true },
    });
    visible = me
      ? researchers.filter((r) =>
          r.coSupervisedStudents.some((c) => c.studentId === me.id),
        )
      : [];
  } else {
    visible = [];
  }
  return visible.filter((r) => r.id !== viewerId);
}

/** Visible researchers' workspace Drive folders (for the Files module). */
export async function getVisibleResearcherFolders(
  viewerId: string,
  role: Role,
): Promise<{ id: string; name: string; color: string; driveFolderId: string }[]> {
  const visible = await visibleResearchers(viewerId, role, { driveFolderId: true });
  return visible
    .filter((r) => r.driveFolderId)
    .map((r) => ({
      id: r.id,
      name: r.name?.trim() || "Researcher",
      color: r.color,
      driveFolderId: r.driveFolderId!,
    }));
}

/** Visible researchers' workspace calendars (for the Calendars list). */
export async function getVisibleResearcherCalendars(
  viewerId: string,
  role: Role,
): Promise<{ id: string; name: string; color: string; calendarId: string }[]> {
  const visible = await visibleResearchers(viewerId, role);
  return visible
    .filter((r) => r.calendarId)
    .map((r) => ({
      id: r.id,
      name: r.name?.trim() || "Researcher",
      color: r.color,
      calendarId: r.calendarId!,
    }));
}

export async function getResearcherCalendarEvents(
  viewerId: string,
  role: Role,
  fromIso: string,
  toIso: string,
): Promise<ExternalCalEvent[]> {
  const visible = (await visibleResearchers(viewerId, role)).filter(
    (r) => r.calendarId,
  );
  if (visible.length === 0) return [];

  const out: ExternalCalEvent[] = [];
  await Promise.all(
    visible.map(async (r) => {
      try {
        const cal = await calendarForUser(r.id);
        if (!cal || !r.calendarId) return;
        const res = await cal.events.list({
          calendarId: r.calendarId,
          timeMin: fromIso,
          timeMax: toIso,
          singleEvents: true,
          orderBy: "startTime",
          maxResults: 250,
        });
        const name = r.name?.trim() || "Researcher";
        for (const ev of res.data.items ?? []) {
          const startDate = ev.start?.date; // all-day
          const startDt = ev.start?.dateTime;
          const start = startDt ?? (startDate ? `${startDate}T00:00:00` : null);
          const endDt = ev.end?.dateTime;
          const end =
            endDt ?? (ev.end?.date ? `${ev.end.date}T00:00:00` : start);
          if (!start || !end || ev.status === "cancelled") continue;
          out.push({
            id: `ext-${r.id}-${ev.id}`,
            title: ev.summary?.trim() || "(busy)",
            description: ev.description ?? null,
            location: ev.location ?? null,
            startsAt: new Date(start).toISOString(),
            endsAt: new Date(end).toISOString(),
            allDay: !!startDate,
            external: true,
            ownerName: name,
            student: {
              id: `ext-${r.id}`,
              fullName: `${name} · calendar`,
              alias: null,
              color: r.color,
            },
          });
        }
      } catch {
        // best-effort: skip a calendar we can't read
      }
    }),
  );
  return out;
}
