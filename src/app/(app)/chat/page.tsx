import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { computeUnreadByChannel } from "@/lib/chat-access";
import { ChatView } from "./chat-view";

export default async function ChatPage({
  searchParams,
}: {
  searchParams: Promise<{ student?: string; channel?: string }>;
}) {
  const sp = await searchParams;
  const session = (await auth())!;

  // Chat-eligible students = those the viewer supervises / co-supervises /
  // externally-advises / is on committee for / is — but NOT students they
  // only *team-advise* (team advisor is read-only: no chat).
  const visibleStudents = await prisma.student.findMany({
    where: {
      OR: [
        { supervisorId: session.user.id },
        {
          coSupervisors: {
            some: { userId: session.user.id, role: { not: "team_advisor" } },
          },
        },
        { userId: session.user.id },
      ],
    },
    select: { id: true, fullName: true, alias: true, color: true },
  });

  const channels = await prisma.channel.findMany({
    where: {
      OR: [
        { members: { some: { userId: session.user.id } } },
        { studentId: { in: visibleStudents.map((s) => s.id) } },
        { kind: "general" },
      ],
    },
    include: {
      student: { select: { id: true, fullName: true, alias: true, color: true } },
      members: { include: { user: { select: { id: true, name: true, image: true, color: true } } } },
      _count: { select: { messages: true } },
    },
    orderBy: { updatedAt: "desc" },
  });

  // Member picker for "New channel". A student may only start a channel with
  // their own supervisors (primary + co_supervisor) — never advisors,
  // committee, or other students. Everyone else picks from the full roster.
  const teamMembers =
    session.user.role === "student"
      ? await (async () => {
          const me = await prisma.student.findFirst({
            where: { userId: session.user.id },
            select: {
              supervisorId: true,
              coSupervisors: {
                where: { role: { in: ["supervisor", "co_supervisor"] } },
                select: { userId: true },
              },
            },
          });
          const ids = [
            ...(me?.supervisorId ? [me.supervisorId] : []),
            ...(me?.coSupervisors.map((c) => c.userId) ?? []),
          ];
          if (ids.length === 0) return [];
          return prisma.user.findMany({
            where: { id: { in: ids } },
            select: { id: true, name: true, image: true, color: true, role: true },
            orderBy: { name: "asc" },
          });
        })()
      : await prisma.user.findMany({
          where: {
            OR: [
              { role: { in: ["admin", "supervisor"] } },
              // Student-role users only count if their Student record still
              // exists — drop orphans left behind by a deleted student.
              { role: "student", studentProfile: { isNot: null } },
            ],
          },
          select: { id: true, name: true, image: true, color: true, role: true },
          orderBy: { name: "asc" },
        });

  const { byChannel: unreadByChannel } = await computeUnreadByChannel(session.user.id);

  return (
    <ChatView
      meId={session.user.id}
      meRole={session.user.role}
      initialUnreadByChannel={unreadByChannel}
      channels={channels.map((c) => ({
        id: c.id,
        name: c.name,
        kind: c.kind,
        color: c.color,
        description: c.description,
        student: c.student,
        memberCount: c.members.length,
        members: c.members.map((m) => m.user),
      }))}
      teamMembers={teamMembers}
      students={visibleStudents}
      initialChannelId={sp.channel ?? null}
      initialStudentId={sp.student ?? null}
    />
  );
}
