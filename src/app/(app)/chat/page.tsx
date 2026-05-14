import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { studentVisibilityWhere, type Role } from "@/lib/access";
import { computeUnreadByChannel } from "@/lib/chat-access";
import { ChatView } from "./chat-view";

export default async function ChatPage({
  searchParams,
}: {
  searchParams: Promise<{ student?: string; channel?: string }>;
}) {
  const sp = await searchParams;
  const session = (await auth())!;
  const role = session.user.role as Role;

  const visibleStudents = await prisma.student.findMany({
    where: studentVisibilityWhere(session.user.id, role),
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

  const teamMembers = await prisma.user.findMany({
    where: { role: { in: ["admin", "supervisor", "student"] } },
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
