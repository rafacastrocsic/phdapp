import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { isAdmin, type Role } from "@/lib/access";
import { FeedbackView } from "./feedback-view";

export default async function FeedbackPage() {
  const session = (await auth())!;
  const role = session.user.role as Role;
  const admin = isAdmin(role);

  const rows = await prisma.feedback.findMany({
    where: admin ? {} : { authorId: session.user.id },
    include: {
      author: { select: { id: true, name: true, image: true, color: true } },
      repliedBy: { select: { id: true, name: true } },
    },
    orderBy: [{ createdAt: "desc" }],
  });

  // Mark seen so the sidebar bubble resets on the next poll.
  await prisma.user.update({
    where: { id: session.user.id },
    data: { feedbackLastSeenAt: new Date() },
  });

  return (
    <FeedbackView
      isAdmin={admin}
      initialItems={rows.map((f) => ({
        id: f.id,
        kind: f.kind,
        subject: f.subject,
        body: f.body,
        status: f.status,
        adminReply: f.adminReply,
        repliedBy: f.repliedBy,
        repliedAt: f.repliedAt?.toISOString() ?? null,
        createdAt: f.createdAt.toISOString(),
        updatedAt: f.updatedAt.toISOString(),
        author: admin ? f.author : null,
        mine: f.authorId === session.user.id,
      }))}
    />
  );
}
