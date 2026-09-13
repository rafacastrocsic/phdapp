import { notFound } from "next/navigation";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import {
  isAdmin,
  studentVisibilityWhere,
  studentVisibilityWhereAllForAdmin,
  type Role,
} from "@/lib/access";
import { isSeniorTeam, canSeeVisibility } from "@/lib/discussions-access";
import { getTeamDriveFolder } from "@/lib/team-drive";
import { parseLinks } from "@/lib/links";
import { displayName } from "@/lib/utils";
import { TopicDetail } from "./topic-detail";

export default async function TopicPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const session = (await auth())!;
  const role = session.user.role as Role;
  const senior = await isSeniorTeam(session.user.id, role);

  const topic = await prisma.topic.findUnique({
    where: { id },
    include: {
      author: { select: { id: true, name: true, image: true, color: true } },
      student: { select: { id: true, fullName: true, alias: true, color: true } },
      linkedTask: { select: { id: true, title: true } },
      linkedEvent: { select: { id: true, title: true } },
      linkedChannel: { select: { id: true, name: true } },
    },
  });
  if (!topic) notFound();
  if (!canSeeVisibility(topic.visibility, senior)) notFound();

  const canEdit = isAdmin(role) || topic.authorId === session.user.id;

  // For the author/admin: Drive-folder roots (visible students' folders +
  // the team folder) and the student list for the edit dialog's tag picker.
  let driveRoots: { id: string; name: string; kind: "student" | "team" }[] = [];
  let students: { id: string; name: string; color: string }[] = [];
  if (canEdit) {
    const visible = await prisma.student.findMany({
      where: studentVisibilityWhere(session.user.id, role),
      select: {
        id: true,
        fullName: true,
        alias: true,
        color: true,
        driveFolderId: true,
      },
      orderBy: { fullName: "asc" },
    });
    students = visible.map((s) => ({
      id: s.id,
      name: displayName(s),
      color: s.color,
    }));
    driveRoots = visible
      .filter((s) => s.driveFolderId)
      .map((s) => ({
        id: s.driveFolderId!,
        name: displayName(s),
        kind: "student" as const,
      }));
    const teamDrive = await getTeamDriveFolder();
    if (teamDrive?.id)
      driveRoots.push({ id: teamDrive.id, name: "Team Drive", kind: "team" });
  }

  // Linkable task / event / chat options for the edit dialog's pickers.
  let taskOpts: { id: string; title: string }[] = [];
  let eventOpts: { id: string; title: string }[] = [];
  let channelOpts: { id: string; name: string }[] = [];
  if (canEdit) {
    const visForTasks = studentVisibilityWhereAllForAdmin(session.user.id, role);
    const [tasks, visStudents, channels] = await Promise.all([
      prisma.ticket.findMany({
        where: { archivedAt: null, student: visForTasks },
        select: { id: true, title: true, student: { select: { fullName: true, alias: true } } },
        orderBy: [{ createdAt: "desc" }],
        take: 400,
      }),
      prisma.student.findMany({ where: visForTasks, select: { id: true } }),
      prisma.channel.findMany({
        where: isAdmin(role) ? {} : { members: { some: { userId: session.user.id } } },
        select: { id: true, name: true },
        orderBy: { name: "asc" },
        take: 200,
      }),
    ]);
    taskOpts = tasks.map((t) => ({
      id: t.id,
      title: t.student ? `${t.title} · ${displayName(t.student)}` : t.title,
    }));
    const sids = visStudents.map((s) => s.id);
    const since = new Date(Date.now() - 90 * 86_400_000);
    const events = await prisma.event.findMany({
      where: {
        ticketId: null,
        subtaskParentId: null,
        startsAt: { gte: since },
        OR: [
          { studentId: { in: sids } },
          { studentId: null, isGeneral: true },
          { ownerId: session.user.id },
        ],
      },
      select: { id: true, title: true, startsAt: true },
      orderBy: { startsAt: "desc" },
      take: 300,
    });
    eventOpts = events.map((e) => ({ id: e.id, title: e.title }));
    channelOpts = channels.map((c) => ({ id: c.id, name: c.name }));
  }

  return (
    <TopicDetail
      viewerId={session.user.id}
      canEdit={canEdit}
      driveRoots={driveRoots}
      students={students}
      taskOpts={taskOpts}
      eventOpts={eventOpts}
      channelOpts={channelOpts}
      topic={{
        id: topic.id,
        title: topic.title,
        body: topic.body,
        visibility: topic.visibility as "team" | "supervisors",
        pinned: topic.pinned,
        closed: !!topic.closedAt,
        author: topic.author,
        student: topic.student
          ? {
              id: topic.student.id,
              name: displayName(topic.student),
              color: topic.student.color,
            }
          : null,
        links: parseLinks(topic.links),
        driveFolderUrl: topic.driveFolderUrl,
        task: topic.linkedTask,
        event: topic.linkedEvent,
        chat: topic.linkedChannel,
        createdAt: topic.createdAt.toISOString(),
      }}
    />
  );
}
