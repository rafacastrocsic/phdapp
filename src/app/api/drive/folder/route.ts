import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { driveForUser } from "@/lib/google";

// Resolve a single Drive folder's display name from its ID. Powers the
// task Drive-folder field so it shows the folder name (not the raw ID)
// when an event/task already has a folder linked.
export async function GET(req: Request) {
  const session = await auth();
  if (!session?.user)
    return NextResponse.json({ error: "unauth" }, { status: 401 });

  const id = new URL(req.url).searchParams.get("id");
  if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });

  const drive = await driveForUser(session.user.id);
  if (!drive)
    return NextResponse.json(
      { error: "Google account not linked." },
      { status: 400 },
    );

  try {
    const r = await drive.files.get({
      fileId: id,
      fields: "id, name",
      supportsAllDrives: true,
    });
    return NextResponse.json({ id: r.data.id, name: r.data.name ?? null });
  } catch (err) {
    const msg = (err as Error).message ?? "Drive request failed";
    return NextResponse.json({ error: msg }, { status: 404 });
  }
}
