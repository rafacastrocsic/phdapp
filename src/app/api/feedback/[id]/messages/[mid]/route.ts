import { NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { isAdmin, type Role } from "@/lib/access";

const PatchBody = z.object({
  body: z.string().trim().min(1).max(5000),
});

// Edit your own message. Admins can edit any message in any thread.
export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string; mid: string }> },
) {
  const session = await auth();
  if (!session?.user)
    return NextResponse.json({ error: "unauth" }, { status: 401 });

  const { mid } = await params;
  const msg = await prisma.feedbackMessage.findUnique({
    where: { id: mid },
    select: { id: true, authorId: true },
  });
  if (!msg) return NextResponse.json({ error: "not found" }, { status: 404 });

  const admin = isAdmin(session.user.role as Role);
  if (msg.authorId !== session.user.id && !admin)
    return NextResponse.json({ error: "forbidden" }, { status: 403 });

  const json = await req.json().catch(() => null);
  const parsed = PatchBody.safeParse(json);
  if (!parsed.success)
    return NextResponse.json({ error: "bad input" }, { status: 400 });

  const updated = await prisma.feedbackMessage.update({
    where: { id: mid },
    data: { body: parsed.data.body, editedAt: new Date() },
  });
  return NextResponse.json({
    id: updated.id,
    body: updated.body,
    editedAt: updated.editedAt?.toISOString() ?? null,
  });
}

// Delete your own message. Admins can delete any message.
export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string; mid: string }> },
) {
  const session = await auth();
  if (!session?.user)
    return NextResponse.json({ error: "unauth" }, { status: 401 });

  const { mid } = await params;
  const msg = await prisma.feedbackMessage.findUnique({
    where: { id: mid },
    select: { id: true, authorId: true },
  });
  if (!msg) return NextResponse.json({ error: "not found" }, { status: 404 });

  const admin = isAdmin(session.user.role as Role);
  if (msg.authorId !== session.user.id && !admin)
    return NextResponse.json({ error: "forbidden" }, { status: 403 });

  await prisma.feedbackMessage.delete({ where: { id: mid } });
  return NextResponse.json({ ok: true });
}
