import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import {
  studentVisibilityWhere,
  type Role,
} from "@/lib/access";
import { isSeniorTeam, topicVisibilityWhere } from "@/lib/discussions-access";
import { parseLinks } from "@/lib/links";
import { displayName } from "@/lib/utils";
import { DiscussionsView } from "./discussions-view";

export default async function DiscussionsPage() {
  const session = (await auth())!;
  const role = session.user.role as Role;
  const senior = await isSeniorTeam(session.user.id, role);

  const topics = await prisma.topic.findMany({
    where: topicVisibilityWhere(senior),
    include: {
      author: { select: { name: true, image: true, color: true } },
      student: { select: { id: true, fullName: true, alias: true, color: true } },
      _count: { select: { comments: true } },
    },
    orderBy: [{ pinned: "desc" }, { lastActivityAt: "desc" }],
  });

  // Students the viewer can see — for the "tag a student" picker in the
  // New / Edit dialogs. Senior team only (students don't create topics).
  const students = senior
    ? await prisma.student.findMany({
        where: studentVisibilityWhere(session.user.id, role),
        select: { id: true, fullName: true, alias: true, color: true },
        orderBy: { fullName: "asc" },
      })
    : [];

  // Visiting the list clears the sidebar's "new discussions" badge.
  await prisma.user.update({
    where: { id: session.user.id },
    data: { discussionsLastSeenAt: new Date() },
  });

  return (
    <DiscussionsView
      canCreate={true}
      senior={senior}
      viewerId={session.user.id}
      students={students.map((s) => ({
        id: s.id,
        name: displayName(s),
        color: s.color,
      }))}
      topics={topics.map((t) => ({
        id: t.id,
        title: t.title,
        excerpt: t.body ? t.body.slice(0, 240) : null,
        author: t.author,
        visibility: t.visibility as "team" | "supervisors",
        student: t.student
          ? { id: t.student.id, name: displayName(t.student), color: t.student.color }
          : null,
        pinned: t.pinned,
        closed: !!t.closedAt,
        commentCount: t._count.comments,
        linkCount: parseLinks(t.links).length,
        hasDrive: !!t.driveFolderUrl,
        lastActivityAt: t.lastActivityAt.toISOString(),
        createdAt: t.createdAt.toISOString(),
      }))}
    />
  );
}
