import { NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import {
  isProjectResearcherAnywhere,
  isSupervisingUser,
  isAdmin,
  type Role,
} from "@/lib/access";
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
  ]),
});

// Provision a Project Researcher's own Drive folder / calendar, exactly like a
// student's is provisioned: an admin or supervisor triggers it, and the
// resource is created in the TRIGGERER's Google account, then shared.
export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await auth();
  if (!session?.user)
    return NextResponse.json({ error: "unauth" }, { status: 401 });
  const role = session.user.role as Role;
  if (!isAdmin(role) && !(await isSupervisingUser(session.user.id, role)))
    return NextResponse.json(
      { error: "Only a supervisor or admin can set up a researcher's workspace." },
      { status: 403 },
    );

  const { id } = await params;
  if (!(await isProjectResearcherAnywhere(id)))
    return NextResponse.json(
      { error: "That user is not a project researcher." },
      { status: 400 },
    );

  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success)
    return NextResponse.json({ error: "bad input" }, { status: 400 });

  const owner = session.user.id;
  const result =
    parsed.data.action === "create_drive"
      ? await createResearcherDriveFolder(id, owner)
      : parsed.data.action === "sync_drive"
        ? await syncResearcherDriveAcl(id, owner)
        : parsed.data.action === "create_calendar"
          ? await createResearcherCalendar(id, owner)
          : await syncResearcherCalendarAcl(id, owner);

  return NextResponse.json(result, { status: result.ok ? 200 : 400 });
}
