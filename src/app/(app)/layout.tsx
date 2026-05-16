import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { Sidebar } from "@/components/app-shell/sidebar";
import { Topbar } from "@/components/app-shell/topbar";
import {
  isSupervisingUser,
  studentVisibilityWhereAllForAdmin,
  type Role,
} from "@/lib/access";
import { computeUnreadByChannel } from "@/lib/chat-access";
import { getDismissedTicketIds } from "@/lib/kanban-dismissed";
import { getDismissedEventIds } from "@/lib/calendar-dismissed";


export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await auth();
  if (!session?.user) redirect("/signin");

  const { total: unreadChat } = await computeUnreadByChannel(session.user.id);

  // Kanban + Calendar "new" counts based on user.*LastSeenAt
  const me = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { kanbanLastSeenAt: true, calendarLastSeenAt: true },
  });
  const visible = await prisma.student.findMany({
    where: studentVisibilityWhereAllForAdmin(session.user.id, session.user.role as Role),
    select: { id: true },
  });
  const visibleIds = visible.map((s) => s.id);
  const dismissedTicketIds = await getDismissedTicketIds(session.user.id);
  const unreadKanban =
    visibleIds.length === 0
      ? 0
      : await prisma.activityLog.count({
          where: {
            studentId: { in: visibleIds },
            actorId: { not: session.user.id },
            action: { in: ["ticket.create", "ticket.update", "ticket.delete"] },
            createdAt: { gt: me?.kanbanLastSeenAt ?? new Date(0) },
            ...(dismissedTicketIds.length > 0
              ? { NOT: { entityId: { in: dismissedTicketIds } } }
              : {}),
          },
        });

  const dismissedEventIds = await getDismissedEventIds(session.user.id);
  const unreadCalendar = await prisma.activityLog.count({
    where: {
      OR: [{ studentId: { in: visibleIds } }, { studentId: null }],
      actorId: { not: session.user.id },
      action: { in: ["event.create", "event.update", "event.delete"] },
      createdAt: { gt: me?.calendarLastSeenAt ?? new Date(0) },
      ...(dismissedEventIds.length > 0
        ? { NOT: { entityId: { in: dismissedEventIds } } }
        : {}),
    },
  });

  // For student-role viewers we want the topbar chip to link to their own
  // student profile (where they can edit it).
  let studentId: string | null = null;
  if (session.user.role === "student") {
    const s = await prisma.student.findFirst({
      where: { userId: session.user.id },
      select: { id: true },
    });
    studentId = s?.id ?? null;
  }

  // Students and real supervisors get a Log Book; external-advisor / committee
  // only users do not.
  const isSupervising = await isSupervisingUser(
    session.user.id,
    session.user.role as Role,
  );
  const showLog =
    session.user.role === "student" ||
    session.user.role === "team_advisor" ||
    isSupervising;

  return (
    <div className="flex h-screen overflow-hidden">
      <Sidebar
        role={session.user.role}
        showLog={showLog}
        unreadChat={unreadChat}
        unreadKanban={unreadKanban}
        unreadCalendar={unreadCalendar}
      />
      <div className="flex flex-1 min-w-0 flex-col">
        <Topbar user={session.user} studentId={studentId} />
        <main className="flex-1 min-w-0 overflow-auto">{children}</main>
      </div>
    </div>
  );
}
