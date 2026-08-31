import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import {
  studentVisibilityWhere,
  studentVisibilityWhereAllForAdmin,
  type Role,
} from "@/lib/access";
import { isSeniorTeam } from "@/lib/discussions-access";
import { getTeamDriveFolder } from "@/lib/team-drive";
import { parseLinks } from "@/lib/links";
import { parseChecklist } from "@/lib/involvement-checklist";
import { displayName } from "@/lib/utils";
import { MyWorkView } from "./my-work-view";

export const dynamic = "force-dynamic";

const INV_INCLUDE = {
  student: { select: { id: true, fullName: true, alias: true, color: true } },
  linkedTask: { select: { id: true, title: true, status: true } },
  linkedEvent: { select: { id: true, title: true, startsAt: true } },
} as const;

export default async function MyWorkPage() {
  const session = (await auth())!;
  const role = session.user.role as Role;
  if (!(await isSeniorTeam(session.user.id, role))) redirect("/");

  const [mineRows, sharedRows] = await Promise.all([
    prisma.involvement.findMany({
      where: { ownerId: session.user.id },
      include: INV_INCLUDE,
      orderBy: [{ pinned: "desc" }, { updatedAt: "desc" }],
    }),
    prisma.involvement.findMany({
      where: { shared: true, ownerId: { not: session.user.id } },
      include: {
        ...INV_INCLUDE,
        owner: { select: { id: true, name: true, image: true, color: true } },
      },
      orderBy: [{ updatedAt: "desc" }],
    }),
  ]);

  // ── Picker data (things this senior can reference) ──
  const visibleStudents = await prisma.student.findMany({
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
  const students = visibleStudents.map((s) => ({
    id: s.id,
    name: displayName(s),
    color: s.color,
  }));

  const linkableTasks = await prisma.ticket.findMany({
    where: {
      archivedAt: null,
      student: studentVisibilityWhereAllForAdmin(session.user.id, role),
    },
    select: {
      id: true,
      title: true,
      status: true,
      student: { select: { fullName: true, alias: true } },
    },
    orderBy: [{ student: { fullName: "asc" } }, { createdAt: "desc" }],
    take: 500,
  });
  const tasks = linkableTasks.map((t) => ({
    id: t.id,
    title: t.title,
    status: t.status,
    studentName: t.student ? displayName(t.student) : "",
  }));

  // Upcoming real events (exclude task/sub-task mirror rows).
  const allVisible = await prisma.student.findMany({
    where: studentVisibilityWhereAllForAdmin(session.user.id, role),
    select: { id: true },
  });
  const visibleIds = allVisible.map((s) => s.id);
  const since = new Date(Date.now() - 7 * 86_400_000);
  const eventRows = await prisma.event.findMany({
    where: {
      ticketId: null,
      subtaskParentId: null,
      startsAt: { gte: since },
      OR: [
        { studentId: { in: visibleIds } },
        { studentId: null, isGeneral: true },
        { ownerId: session.user.id },
      ],
    },
    select: { id: true, title: true, startsAt: true },
    orderBy: { startsAt: "asc" },
    take: 200,
  });
  // Make sure any currently-linked event stays selectable even if it's
  // outside the upcoming window.
  const eventMap = new Map(
    eventRows.map((e) => [
      e.id,
      { id: e.id, title: e.title, startsAt: e.startsAt.toISOString() },
    ]),
  );
  for (const r of [...mineRows]) {
    if (r.linkedEvent && !eventMap.has(r.linkedEvent.id))
      eventMap.set(r.linkedEvent.id, {
        id: r.linkedEvent.id,
        title: r.linkedEvent.title,
        startsAt: r.linkedEvent.startsAt.toISOString(),
      });
  }
  const events = Array.from(eventMap.values());

  // Drive-folder roots for the picker (visible students + the team folder).
  const driveRoots: { id: string; name: string; kind: "student" | "team" }[] =
    visibleStudents
      .filter((s) => s.driveFolderId)
      .map((s) => ({
        id: s.driveFolderId!,
        name: displayName(s),
        kind: "student" as const,
      }));
  const teamDrive = await getTeamDriveFolder();
  if (teamDrive?.id)
    driveRoots.push({ id: teamDrive.id, name: "Team Drive", kind: "team" });

  const serialize = (
    r: (typeof mineRows)[number] & {
      owner?: { id: string; name: string | null; image: string | null; color: string };
    },
  ) => ({
    id: r.id,
    title: r.title,
    notes: r.notes,
    progress: r.progress,
    checklist: parseChecklist(r.checklist),
    status: r.status as "active" | "paused" | "done",
    shared: r.shared,
    pinned: r.pinned,
    links: parseLinks(r.links),
    driveFolderUrl: r.driveFolderUrl,
    student: r.student
      ? { id: r.student.id, name: displayName(r.student), color: r.student.color }
      : null,
    task: r.linkedTask
      ? { id: r.linkedTask.id, title: r.linkedTask.title, status: r.linkedTask.status }
      : null,
    event: r.linkedEvent
      ? {
          id: r.linkedEvent.id,
          title: r.linkedEvent.title,
          startsAt: r.linkedEvent.startsAt.toISOString(),
        }
      : null,
    owner: r.owner
      ? { id: r.owner.id, name: r.owner.name, color: r.owner.color }
      : null,
    updatedAt: r.updatedAt.toISOString(),
  });

  return (
    <MyWorkView
      mine={mineRows.map(serialize)}
      shared={sharedRows.map(serialize)}
      students={students}
      tasks={tasks}
      events={events}
      driveRoots={driveRoots}
    />
  );
}
