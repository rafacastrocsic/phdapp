import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { driveForUser } from "@/lib/google";

export async function GET(req: Request) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "unauth" }, { status: 401 });

  const url = new URL(req.url);
  const folderId = url.searchParams.get("folderId");
  const sharedWithMe = url.searchParams.get("sharedWithMe") === "1";
  const foldersOnly = url.searchParams.get("foldersOnly") === "1";

  if (!folderId && !sharedWithMe)
    return NextResponse.json({ error: "folderId or sharedWithMe=1 required" }, { status: 400 });

  const drive = await driveForUser(session.user.id);
  if (!drive)
    return NextResponse.json(
      { error: "Google account not linked." },
      { status: 400 },
    );

  // Build the query
  const parts: string[] = ["trashed = false"];
  if (sharedWithMe) {
    parts.push("sharedWithMe = true");
  } else {
    parts.push(`'${folderId}' in parents`);
  }
  if (foldersOnly) {
    // Include folder shortcuts too — they look like folders to the user
    parts.push(
      "(mimeType = 'application/vnd.google-apps.folder' or mimeType = 'application/vnd.google-apps.shortcut')",
    );
  }

  try {
    const r = await drive.files.list({
      q: parts.join(" and "),
      fields:
        "files(id, name, mimeType, webViewLink, iconLink, modifiedTime, size, shortcutDetails)",
      pageSize: 200,
      orderBy: "folder,name",
    });
    return NextResponse.json({ files: r.data.files ?? [] });
  } catch (err) {
    const msg = (err as Error).message ?? "Drive request failed";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
