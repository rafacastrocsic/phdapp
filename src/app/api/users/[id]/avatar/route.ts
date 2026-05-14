import { NextResponse } from "next/server";
import { put } from "@vercel/blob";
import { nanoid } from "nanoid";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";

const ALLOWED = ["image/png", "image/jpeg", "image/webp", "image/gif"];
const MAX_BYTES = 5 * 1024 * 1024;

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "unauth" }, { status: 401 });

  const { id } = await params;
  const isAdmin = session.user.role === "admin";
  const isSelf = session.user.id === id;
  if (!isAdmin && !isSelf)
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const form = await req.formData().catch(() => null);
  const file = form?.get("file");
  if (!(file instanceof File))
    return NextResponse.json({ error: "No file uploaded" }, { status: 400 });
  if (!ALLOWED.includes(file.type))
    return NextResponse.json({ error: "Unsupported image type" }, { status: 400 });
  if (file.size > MAX_BYTES)
    return NextResponse.json({ error: "Image too large (max 5 MB)" }, { status: 400 });

  const ext =
    {
      "image/png": "png",
      "image/jpeg": "jpg",
      "image/webp": "webp",
      "image/gif": "gif",
    }[file.type] ?? "bin";

  const filename = `${id}-${nanoid(8)}.${ext}`;
  const blob = await put(`users/${filename}`, Buffer.from(await file.arrayBuffer()), {
    access: "public",
    contentType: file.type,
  });
  const url = blob.url;
  await prisma.user.update({ where: { id }, data: { image: url } });
  // If this user is linked to a Student record, sync the photo there too.
  await prisma.student.updateMany({
    where: { userId: id },
    data: { avatarUrl: url },
  });
  return NextResponse.json({ url });
}
