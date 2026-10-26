import { calendarForUser } from "@/lib/google";

/**
 * Push a single-occurrence exception to Google.
 *
 * Google models this natively: a recurring event has *instances*, each with
 * its own id and an `originalStartTime` pointing back at the slot it came
 * from. Moving an occurrence = patching that instance; skipping one = deleting
 * it (Google marks it cancelled, which is what EXDATE means on our side).
 *
 * Best-effort: a Google failure must never block the PhDapp row, so every
 * path returns a warning string instead of throwing.
 */
export async function pushOccurrenceException(opts: {
  actingUserId: string;
  calendarId: string;
  masterGoogleEventId: string;
  originalStart: Date;
  cancelled: boolean;
  startsAt?: Date | null;
  endsAt?: Date | null;
  timeZone?: string | null;
}): Promise<{ googleEventId: string | null; warning: string | null }> {
  const cal = await calendarForUser(opts.actingUserId);
  if (!cal) return { googleEventId: null, warning: "Google account not linked." };

  const tz = opts.timeZone?.trim() || "UTC";
  // Window tightly around the original slot so we get that instance back and
  // not the whole series.
  const timeMin = new Date(opts.originalStart.getTime() - 36 * 3600_000);
  const timeMax = new Date(opts.originalStart.getTime() + 36 * 3600_000);

  let instanceId: string | null = null;
  try {
    const r = await cal.events.instances({
      calendarId: opts.calendarId,
      eventId: opts.masterGoogleEventId,
      timeMin: timeMin.toISOString(),
      timeMax: timeMax.toISOString(),
      maxResults: 50,
      showDeleted: true,
    });
    const target = opts.originalStart.getTime();
    for (const inst of r.data.items ?? []) {
      const ost = inst.originalStartTime?.dateTime ?? inst.originalStartTime?.date;
      const st = inst.start?.dateTime ?? inst.start?.date;
      const when = ost ?? st;
      if (!when) continue;
      // Same calendar day/time as the slot we're overriding.
      if (Math.abs(new Date(when).getTime() - target) < 60_000) {
        instanceId = inst.id ?? null;
        break;
      }
    }
  } catch (err) {
    return {
      googleEventId: null,
      warning: `Saved in PhDapp, but Google's copy of this occurrence couldn't be read: ${
        (err as Error).message ?? "unknown"
      }`,
    };
  }

  if (!instanceId)
    return {
      googleEventId: null,
      warning:
        "Saved in PhDapp, but the matching occurrence wasn't found in Google Calendar.",
    };

  try {
    if (opts.cancelled) {
      // Deleting an instance cancels just that one; the series is untouched.
      await cal.events.delete({
        calendarId: opts.calendarId,
        eventId: instanceId,
        sendUpdates: "all",
      });
      return { googleEventId: instanceId, warning: null };
    }
    await cal.events.patch({
      calendarId: opts.calendarId,
      eventId: instanceId,
      requestBody: {
        ...(opts.startsAt
          ? { start: { dateTime: opts.startsAt.toISOString(), timeZone: tz } }
          : {}),
        ...(opts.endsAt
          ? { end: { dateTime: opts.endsAt.toISOString(), timeZone: tz } }
          : {}),
      },
      sendUpdates: "all",
    });
    return { googleEventId: instanceId, warning: null };
  } catch (err) {
    const e = err as { message?: string; code?: number; status?: number };
    const code = e.code ?? e.status ?? 0;
    if (code === 404 || code === 410)
      return { googleEventId: instanceId, warning: null }; // already gone
    return {
      googleEventId: instanceId,
      warning: `Saved in PhDapp, but Google couldn't be updated: ${e.message ?? "unknown"}`,
    };
  }
}
