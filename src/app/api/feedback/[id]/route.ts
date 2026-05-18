import { NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { isAdmin, type Role } from "@/lib/access";
import { notify } from "@/lib/notify";

const STATUSES = [
  "open",
  "planned",
  "in_progress",
  "done",
  "declined",
] as const;

const Patch = z.object({
  status: z.enum(STATUSES).optional(),
  adminReply: z.string().trim().max(5000).nullable().optional(),
});

// Admin-only: triage status and/or reply to the submitter.
export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await auth();
  if (!session?.user)
    return NextResponse.json({ error: "unauth" }, { status: 401 });
  if (!isAdmin(session.user.role as Role))
    return NextResponse.json({ error: "admin only" }, { status: 403 });

  const { id } = await params;
  const fb = await prisma.feedback.findUnique({ where: { id } });
  if (!fb) return NextResponse.json({ error: "not found" }, { status: 404 });

  const json = await req.json().catch(() => null);
  const parsed = Patch.safeParse(json);
  if (!parsed.success)
    return NextResponse.json({ error: "bad input" }, { status: 400 });
  const d = parsed.data;

  const data: Record<string, unknown> = {};
  if (d.status !== undefined) data.status = d.status;
  const replyChanged =
    d.adminReply !== undefined && (d.adminReply || null) !== fb.adminReply;
  if (d.adminReply !== undefined) {
    data.adminReply = d.adminReply || null;
    if (replyChanged) {
      data.repliedById = session.user.id;
      data.repliedAt = new Date();
    }
  }
  if (Object.keys(data).length === 0)
    return NextResponse.json({ ok: true });

  await prisma.feedback.update({ where: { id }, data });

  // Let the submitter know their feedback was actioned.
  if (fb.authorId !== session.user.id) {
    const statusMsg = d.status ? ` (status: ${d.status.replace("_", " ")})` : "";
    await notify([fb.authorId], {
      type: "feedback.reply",
      message: replyChanged
        ? `An admin replied to your feedback “${fb.subject}”${statusMsg}`
        : `Your feedback “${fb.subject}” was updated${statusMsg}`,
      link: "/feedback",
      actorId: session.user.id,
    }).catch(() => {});
  }

  return NextResponse.json({ ok: true });
}

// The author can withdraw their own submission; admins can remove any.
export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await auth();
  if (!session?.user)
    return NextResponse.json({ error: "unauth" }, { status: 401 });

  const { id } = await params;
  const fb = await prisma.feedback.findUnique({ where: { id } });
  if (!fb) return NextResponse.json({ error: "not found" }, { status: 404 });

  const admin = isAdmin(session.user.role as Role);
  if (!admin && fb.authorId !== session.user.id)
    return NextResponse.json({ error: "forbidden" }, { status: 403 });

  await prisma.feedback.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}
