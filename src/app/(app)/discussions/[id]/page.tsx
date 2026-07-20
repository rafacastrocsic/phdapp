import { notFound } from "next/navigation";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import {
  isAdmin,
  studentVisibilityWhere,
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

  return (
    <TopicDetail
      viewerId={session.user.id}
      canEdit={canEdit}
      driveRoots={driveRoots}
      students={students}
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
        createdAt: topic.createdAt.toISOString(),
      }}
    />
  );
}
