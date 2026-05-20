import { NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { isAdmin, type Role } from "@/lib/access";
import { notify } from "@/lib/notify";

const Body = z.object({
  body: z.string().trim().min(1).max(5000),
});

// Post a reply in a Feedback thread.
// Allowed for the feedback author and for any admin (both directions).
export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await auth();
  if (!session?.user)
    return NextResponse.json({ error: "unauth" }, { status: 401 });

  const { id } = await params;
  const fb = await prisma.feedback.findUnique({
    where: { id },
    select: { id: true, authorId: true, subject: true },
  });
  if (!fb) return NextResponse.json({ error: "not found" }, { status: 404 });

  const admin = isAdmin(session.user.role as Role);
  const isOwner = fb.authorId === session.user.id;
  if (!admin && !isOwner)
    return NextResponse.json({ error: "forbidden" }, { status: 403 });

  const json = await req.json().catch(() => null);
  const parsed = Body.safeParse(json);
  if (!parsed.success)
    return NextResponse.json({ error: "bad input" }, { status: 400 });

  const msg = await prisma.feedbackMessage.create({
    data: {
      feedbackId: id,
      authorId: session.user.id,
      body: parsed.data.body,
    },
    include: {
      author: { select: { id: true, name: true, image: true, color: true } },
    },
  });

  // Bump Feedback.updatedAt so admin listings reorder by latest activity.
  await prisma.feedback.update({
    where: { id },
    data: { updatedAt: new Date() },
  });

  // Notify the OTHER party.
  if (admin && !isOwner) {
    // Admin replied → ping the submitter.
    await notify([fb.authorId], {
      type: "feedback.reply",
      message: `An admin replied to your feedback “${fb.subject}”`,
      link: "/feedback",
      actorId: session.user.id,
    }).catch(() => {});
  } else if (isOwner) {
    // Submitter replied → ping all admins (except the actor themselves
    // if they're an admin posting on their own thread, which is an edge case).
    const admins = await prisma.user.findMany({
      where: { role: "admin", id: { not: session.user.id } },
      select: { id: true },
    });
    if (admins.length) {
      await notify(
        admins.map((a) => a.id),
        {
          type: "feedback.reply",
          message: `New reply on feedback “${fb.subject}”`,
          link: "/feedback",
          actorId: session.user.id,
        },
      ).catch(() => {});
    }
  }

  return NextResponse.json({
    id: msg.id,
    body: msg.body,
    createdAt: msg.createdAt.toISOString(),
    editedAt: msg.editedAt?.toISOString() ?? null,
    author: msg.author,
    mine: true,
  });
}
