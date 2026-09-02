import { NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { isProjectResearcherAnywhere } from "@/lib/access";
import {
  createOwnDriveFolderForUser,
  createOwnCalendarForUser,
  syncOwnDriveFolderAcl,
} from "@/lib/user-workspace-provisioning";

const Body = z.object({
  action: z.enum(["create_drive", "sync_drive", "create_calendar"]),
});

// Self-service workspace provisioning for a Project Researcher. Everything
// acts on the caller's own account (their Google token creates the resources).
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

  const result =
    parsed.data.action === "create_drive"
      ? await createOwnDriveFolderForUser(gate.userId)
      : parsed.data.action === "sync_drive"
        ? await syncOwnDriveFolderAcl(gate.userId)
        : await createOwnCalendarForUser(gate.userId);

  return NextResponse.json(result, { status: result.ok ? 200 : 400 });
}

const Patch = z.object({ shareStudents: z.boolean() });

export async function PATCH(req: Request) {
  const gate = await requireResearcher();
  if ("error" in gate)
    return NextResponse.json({ error: gate.error }, { status: gate.status });

  const parsed = Patch.safeParse(await req.json().catch(() => null));
  if (!parsed.success)
    return NextResponse.json({ error: "bad input" }, { status: 400 });

  await prisma.user.update({
    where: { id: gate.userId },
    data: { workspaceShareStudents: parsed.data.shareStudents },
  });
  // Re-apply sharing so toggling on immediately grants (or, going forward,
  // stops adding) the assigned students. We never remove existing grants.
  const synced = await syncOwnDriveFolderAcl(gate.userId).catch(() => null);
  return NextResponse.json({ ok: true, shareStudents: parsed.data.shareStudents, synced });
}
