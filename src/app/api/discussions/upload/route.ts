import { NextResponse } from "next/server";
import { put } from "@vercel/blob";
import { nanoid } from "nanoid";
import { auth } from "@/auth";

// Attachment uploads for Discussion comments. Unlike chat (which cleans up
// after 7 days), these live under the "discussions/" prefix and are NEVER
// auto-deleted — Discussions is a persistent, long-lived record.

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
    const ext = originalName
      .slice(dot + 1)
      .toLowerCase()
      .replace(/[^a-z0-9]/g, "");
    if (ext && ext.length <= 5) return ext;
  }
  return "bin";
}

export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user)
    return NextResponse.json({ error: "unauth" }, { status: 401 });

  const form = await req.formData().catch(() => null);
  const file = form?.get("file");
  if (!(file instanceof File))
    return NextResponse.json({ error: "No file uploaded" }, { status: 400 });
  if (file.size > MAX_BYTES)
    return NextResponse.json(
      {
        error: `File too large (max ${Math.round(MAX_BYTES / (1024 * 1024))} MB)`,
      },
      { status: 400 },
    );

  const ext = extFor(file.type, file.name);
  const filename = `${session.user.id}-${nanoid(10)}.${ext}`;
  const blob = await put(
    `discussions/${filename}`,
    Buffer.from(await file.arrayBuffer()),
    {
      access: "public",
      contentType: file.type || "application/octet-stream",
    },
  );

  return NextResponse.json({
    name: file.name,
    url: blob.url,
    mimeType: file.type || "application/octet-stream",
    size: file.size,
  });
}
