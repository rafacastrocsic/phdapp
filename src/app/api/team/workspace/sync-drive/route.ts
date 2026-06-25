import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { isSupervisingUser, type Role } from "@/lib/access";
import { syncTeamDriveAcl } from "@/lib/team-drive";

// Grant the senior team writer access to the shared team Drive folder
// so the Files-module "Team Drive" entry lists contents for everyone,
// not just the folder owner. Any supervising user can trigger it
// (the folder is theirs collectively); the sharing itself only
// succeeds via an account that can actually manage the folder.
export async function POST() {
  const session = await auth();
  if (!session?.user)
    return NextResponse.json({ error: "unauth" }, { status: 401 });
  if (!(await isSupervisingUser(session.user.id, session.user.role as Role)))
    return NextResponse.json({ error: "forbidden" }, { status: 403 });

  const result = await syncTeamDriveAcl(session.user.id);
  return NextResponse.json(result);
}
