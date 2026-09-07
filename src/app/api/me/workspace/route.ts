import { NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { isProjectResearcherAnywhere } from "@/lib/access";
import {
  createResearcherDriveFolder,
  syncResearcherDriveAcl,
  createResearcherCalendar,
  syncResearcherCalendarAcl,
} from "@/lib/user-workspace-provisioning";

const Body = z.object({
  action: z.enum([
    "create_drive",
    "sync_drive",
    "create_calendar",
    "sync_calendar",
    // "clear_*" forgets the app-side link so a fresh one can be created; the
    // Google folder/calendar in the researcher's own account is left as-is.
    "clear_drive",
    "clear_calendar",
  ]),
});

// Self-service workspace for a Project Researcher: their OWN Drive folder and
// calendar, created in THEIR OWN Google account (they're both subject and
// owner) and shared view-only with the students they work with and those
// students' supervisors + team advisors.
async function requireResearcher() {
  const session = await auth();
  if (!session?.user) return { error: "unauth" as const, status: 401 };
  if (!(await isProjectResearcherAnywhere(session.user.id)))
    return { error: "My workspace is for project researchers." as const, status: 403 };
  return { userId: session.user.id };
}

export async function POST(req: Request) {
  const gate = await requireResearcher();
  if ("error" in gate)
    return NextResponse.json({ error: gate.error }, { status: gate.status });

  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success)
    return NextResponse.json({ error: "bad input" }, { status: 400 });

  const id = gate.userId;
  const a = parsed.data.action;

  if (a === "clear_drive" || a === "clear_calendar") {
    await prisma.user.update({
      where: { id },
      data: a === "clear_drive" ? { driveFolderId: null } : { calendarId: null },
    });
    return NextResponse.json({ ok: true });
  }

  // owner === subject === the researcher, so the resource lives in their Drive.
  const result =
    a === "create_drive"
      ? await createResearcherDriveFolder(id, id)
      : a === "sync_drive"
        ? await syncResearcherDriveAcl(id, id)
        : a === "create_calendar"
          ? await createResearcherCalendar(id, id)
          : await syncResearcherCalendarAcl(id, id);

  return NextResponse.json(result, { status: result.ok ? 200 : 400 });
}
