import { NextResponse } from "next/server";
import { put } from "@vercel/blob";
import { nanoid } from "nanoid";
import { auth } from "@/auth";

const MAX_BYTES = 10 * 1024 * 1024; // 10 MB

const IMAGE_EXT: Record<string, string> = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/webp": "webp",
  "image/gif": "gif",
};

// Optional screenshot/photo for a feedback item. Image-only.
export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user)
    return NextResponse.json({ error: "unauth" }, { status: 401 });

  const form = await req.formData().catch(() => null);
  const file = form?.get("file");
  if (!(file instanceof File))
    return NextResponse.json({ error: "No file uploaded" }, { status: 400 });

  const ext = IMAGE_EXT[file.type];
  if (!ext)
    return NextResponse.json(
      { error: "Only PNG, JPG, WEBP or GIF images are allowed." },
      { status: 400 },
    );
  if (file.size > MAX_BYTES)
    return NextResponse.json(
      {
        error: `Image too large (max ${Math.round(
          MAX_BYTES / (1024 * 1024),
        )} MB)`,
      },
      { status: 400 },
    );

  const filename = `${session.user.id}-${nanoid(10)}.${ext}`;
  const blob = await put(
    `feedback/${filename}`,
    Buffer.from(await file.arrayBuffer()),
    { access: "public", contentType: file.type },
  );

  return NextResponse.json({ url: blob.url });
}
