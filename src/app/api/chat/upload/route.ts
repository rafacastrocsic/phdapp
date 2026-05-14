import { NextResponse } from "next/server";
import { put } from "@vercel/blob";
import { nanoid } from "nanoid";
import { auth } from "@/auth";
import { maybeCleanupChatAttachments } from "@/lib/chat-cleanup";

const MAX_BYTES = 25 * 1024 * 1024; // 25 MB

const SAFE_EXT: Record<string, string> = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/webp": "webp",
  "image/gif": "gif",
  "image/svg+xml": "svg",
  "application/pdf": "pdf",
  "application/zip": "zip",
  "application/json": "json",
  "text/plain": "txt",
  "text/csv": "csv",
  "text/markdown": "md",
  "application/vnd.ms-excel": "xls",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": "xlsx",
  "application/msword": "doc",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document": "docx",
  "application/vnd.ms-powerpoint": "ppt",
  "application/vnd.openxmlformats-officedocument.presentationml.presentation": "pptx",
};

function extFor(mime: string, originalName: string): string {
  if (SAFE_EXT[mime]) return SAFE_EXT[mime];
  const dot = originalName.lastIndexOf(".");
  if (dot > 0) {
    const ext = originalName.slice(dot + 1).toLowerCase().replace(/[^a-z0-9]/g, "");
    if (ext && ext.length <= 5) return ext;
  }
  return "bin";
}

export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "unauth" }, { status: 401 });

  // Background cleanup of chat attachments older than 7 days; throttled to
  // run at most once per hour, doesn't block the upload response.
  void maybeCleanupChatAttachments();

  const form = await req.formData().catch(() => null);
  const file = form?.get("file");
  if (!(file instanceof File))
    return NextResponse.json({ error: "No file uploaded" }, { status: 400 });
  if (file.size > MAX_BYTES)
    return NextResponse.json(
      { error: `File too large (max ${Math.round(MAX_BYTES / (1024 * 1024))} MB)` },
      { status: 400 },
    );

  const ext = extFor(file.type, file.name);
  const filename = `${session.user.id}-${nanoid(10)}.${ext}`;
  const blob = await put(`chat/${filename}`, Buffer.from(await file.arrayBuffer()), {
    access: "public",
    contentType: file.type || "application/octet-stream",
  });
  const url = blob.url;

  return NextResponse.json({
    name: file.name,
    url,
    mimeType: file.type || "application/octet-stream",
    size: file.size,
  });
}
