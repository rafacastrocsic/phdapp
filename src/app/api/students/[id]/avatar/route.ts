import { NextResponse } from "next/server";
import { put } from "@vercel/blob";
import { nanoid } from "nanoid";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import {
  accessForStudent,
  canEditStudentProfile,
  studentVisibilityWhereAllForAdmin,
  type Role,
} from "@/lib/access";
import { logActivity } from "@/lib/activity-log";

const ALLOWED = ["image/png", "image/jpeg", "image/webp", "image/gif"];
const MAX_BYTES = 5 * 1024 * 1024;

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "unauth" }, { status: 401 });

  const { id } = await params;
  const access = await accessForStudent(id, session.user.id, session.user.role as Role);
  if (!canEditStudentProfile(access))
    return NextResponse.json(
      { error: "You don't have permission to edit this student's photo" },
      { status: 403 },
    );
  const student = await prisma.student.findFirst({
    where: { id, ...studentVisibilityWhereAllForAdmin(session.user.id, session.user.role as Role) },
  });
  if (!student) return NextResponse.json({ error: "not found" }, { status: 404 });

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
  const buf = Buffer.from(await file.arrayBuffer());
  const blob = await put(`students/${filename}`, buf, {
    access: "public",
    contentType: file.type,
  });
  const url = blob.url;
  const updated = await prisma.student.update({
    where: { id },
    data: { avatarUrl: url },
    select: { userId: true },
  });
  // Keep the linked User.image in sync so the photo appears anywhere this user is rendered.
  if (updated.userId) {
    await prisma.user.update({ where: { id: updated.userId }, data: { image: url } });
  }

  await logActivity({
    actorId: session.user.id,
    actorRole: session.user.role,
    studentId: id,
    action: "student.avatar",
    entityType: "student",
    entityId: id,
    summary: `updated the profile photo`,
  });

  return NextResponse.json({ url });
}
