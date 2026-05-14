import { NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import {
  accessForStudent,
  canEditStudentProfile,
  type Role,
} from "@/lib/access";
import { logActivity } from "@/lib/activity-log";

const Body = z.object({
  driveFileId: z.string().min(1),
  name: z.string().min(1),
  mimeType: z.string().min(1),
  webViewLink: z.string().nullable().optional(),
  iconLink: z.string().nullable().optional(),
  parentFolderId: z.string().nullable().optional(),
});

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "unauth" }, { status: 401 });
  const { id } = await params;

  // Anyone who can see the student can read their favorites.
  const access = await accessForStudent(id, session.user.id, session.user.role as Role);
  if (!access) return NextResponse.json({ error: "forbidden" }, { status: 403 });

  const favorites = await prisma.favoriteFile.findMany({
    where: { studentId: id },
    include: {
      starredBy: { select: { id: true, name: true, image: true, color: true } },
    },
    orderBy: { createdAt: "desc" },
  });
  return NextResponse.json({ favorites });
}

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "unauth" }, { status: 401 });
  const { id } = await params;

  const access = await accessForStudent(id, session.user.id, session.user.role as Role);
  if (!canEditStudentProfile(access))
    return NextResponse.json(
      { error: "You don't have permission to manage this student's favorites" },
      { status: 403 },
    );

  const json = await req.json().catch(() => null);
  const parsed = Body.safeParse(json);
  if (!parsed.success) return NextResponse.json({ error: "bad input" }, { status: 400 });
  const d = parsed.data;

  try {
    const created = await prisma.favoriteFile.create({
      data: {
        studentId: id,
        driveFileId: d.driveFileId,
        name: d.name,
        mimeType: d.mimeType,
        webViewLink: d.webViewLink || null,
        iconLink: d.iconLink || null,
        parentFolderId: d.parentFolderId || null,
        starredById: session.user.id,
      },
      include: {
        starredBy: { select: { id: true, name: true, image: true, color: true } },
      },
    });
    await logActivity({
      actorId: session.user.id,
      actorRole: session.user.role,
      studentId: id,
      action: "favorite.add",
      entityType: "file",
      entityId: d.driveFileId,
      summary: `starred “${d.name}” as a main document`,
    });
    return NextResponse.json({ favorite: created });
  } catch (err) {
    const e = err as { code?: string };
    if (e.code === "P2002")
      return NextResponse.json(
        { error: "Already starred." },
        { status: 409 },
      );
    throw err;
  }
}
