import { NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { isAdmin, type Role } from "@/lib/access";

const PatchBody = z.object({
  body: z.string().trim().min(1).max(5000),
});

// Edit the body of a chat message. Only the author can edit; admins
// can edit any message. Sets editedAt so the UI can render an
// "(edited)" indicator on the bubble. Attachments and replyToId are
// not editable through this endpoint.
export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string; mid: string }> },
) {
  const session = await auth();
  if (!session?.user)
    return NextResponse.json({ error: "unauth" }, { status: 401 });

  const { id, mid } = await params;
  const msg = await prisma.message.findFirst({
    where: { id: mid, channelId: id },
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

  const updated = await prisma.message.update({
    where: { id: mid },
    data: { body: parsed.data.body, editedAt: new Date() },
    select: { id: true, body: true, editedAt: true },
  });
  return NextResponse.json({
    id: updated.id,
    body: updated.body,
    editedAt: updated.editedAt?.toISOString() ?? null,
  });
}
