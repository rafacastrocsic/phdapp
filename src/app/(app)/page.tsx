import Link from "next/link";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { StatCard } from "@/components/stat-card";
import { Avatar } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  GraduationCap,
  KanbanSquare,
  CalendarDays,
  AlertTriangle,
  ArrowRight,
  Clock,
} from "lucide-react";
import { format } from "date-fns";
import { relativeTime, displayName } from "@/lib/utils";

const STATUS_LABEL: Record<string, string> = {
  backlog: "Backlog",
  todo: "To do",
  in_progress: "In progress",
  review: "Review",
  blocked: "Blocked",
  done: "Done",
};

const STATUS_COLOR: Record<string, string> = {
  backlog: "#94a3b8",
  todo: "#2196f3",
  in_progress: "#ff7a45",
  review: "#a855f7",
  blocked: "#e2445c",
  done: "#00ca72",
};

const PRIORITY_COLOR: Record<string, string> = {
  low: "#94a3b8",
  medium: "#2196f3",
  high: "#ff7a45",
  urgent: "#e2445c",
};

export default async function DashboardPage() {
  const session = (await auth())!;
  const userId = session.user.id;
  const role = session.user.role;

  // Anyone sees every student they're linked to in any way (primary or
  // additional supervisor of, or the student themselves).
  const studentWhere = {
    OR: [
      { supervisorId: userId },
      { coSupervisors: { some: { userId } } },
      { userId },
    ],
  };

  const students = await prisma.student.findMany({
    where: studentWhere,
    include: { supervisor: true, _count: { select: { tickets: true } } },
    orderBy: { fullName: "asc" },
  });
  const studentIds = students.map((s) => s.id);

  const [openTickets, overdueTickets, upcomingEvents, recentTickets] = await Promise.all([
    prisma.ticket.count({
      where: { studentId: { in: studentIds }, status: { notIn: ["done"] } },
    }),
    prisma.ticket.count({
      where: {
        studentId: { in: studentIds },
        status: { notIn: ["done"] },
        dueDate: { lt: new Date() },
      },
    }),
    prisma.event.findMany({
      where: {
        studentId: { in: studentIds },
        startsAt: { gte: new Date() },
      },
      include: { student: true },
      orderBy: { startsAt: "asc" },
      take: 5,
    }),
    prisma.ticket.findMany({
      where: { studentId: { in: studentIds } },
      include: { student: true, assignee: true },
      orderBy: { updatedAt: "desc" },
      take: 6,
    }),
  ]);

  return (
    <div className="p-6 lg:p-8 space-y-6">
      <div className="flex items-end justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">
            Hi, {session.user.name?.split(" ")[0] ?? "there"} 👋
          </h1>
          <p className="text-sm text-slate-500 mt-1">
            {role === "student"
              ? "Here's what's on your plate today."
              : "Here's what's happening across your supervision today."}
          </p>
        </div>
      </div>

      <div
        className={
          role === "student"
            ? "grid grid-cols-1 sm:grid-cols-3 gap-4"
            : "grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4"
        }
      >
        {role !== "student" && (
          <StatCard
            label="Active students"
            value={students.filter((s) => s.status === "active").length}
            icon={GraduationCap}
            color="var(--c-pink)"
            hint={`${students.length} total`}
          />
        )}
        <StatCard
          label="Open tasks"
          value={openTickets}
          icon={KanbanSquare}
          color="var(--c-orange)"
          hint={role === "student" ? "yours" : "across all students"}
        />
        <StatCard
          label="Overdue"
          value={overdueTickets}
          icon={AlertTriangle}
          color="var(--c-red)"
          hint={overdueTickets ? "needs attention" : "all on track"}
        />
        <StatCard
          label="Upcoming events"
          value={upcomingEvents.length}
          icon={CalendarDays}
          color="var(--c-teal)"
          hint="next 5 in calendar"
        />
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
        <Card className="xl:col-span-2">
          <CardHeader className="flex items-center justify-between flex-row">
            <CardTitle>Recent activity</CardTitle>
            <Link
              href="/kanban"
              className="text-xs font-semibold text-[var(--c-violet)] flex items-center gap-1 hover:underline"
            >
              Open Tasks <ArrowRight className="h-3 w-3" />
            </Link>
          </CardHeader>
          <CardContent className="p-0">
            {recentTickets.length === 0 ? (
              <EmptyState
                title="No tasks yet"
                hint="Create your first task from the Tasks board."
              />
            ) : (
              <ul className="divide-y">
                {recentTickets.map((t) => (
                  <li key={t.id} className="flex items-center gap-3 p-4 hover:bg-slate-50">
                    <span
                      className="h-2.5 w-2.5 rounded-full shrink-0"
                      style={{ background: STATUS_COLOR[t.status] }}
                    />
                    <div className="flex-1 min-w-0">
                      <Link
                        href={`/kanban?ticket=${t.id}`}
                        className="block text-sm font-medium text-slate-900 hover:text-[var(--c-violet)] truncate"
                      >
                        {t.title}
                      </Link>
                      <div className="flex items-center gap-2 mt-1 text-xs text-slate-500">
                        <span>
                          for{" "}
                          <Link
                            href={`/students/${t.studentId}`}
                            className="font-medium text-slate-700 hover:underline"
                          >
                            {displayName(t.student)}
                          </Link>
                        </span>
                        <span>·</span>
                        <span>updated {relativeTime(t.updatedAt)}</span>
                      </div>
                    </div>
                    <Badge color={STATUS_COLOR[t.status]} variant="soft">
                      {STATUS_LABEL[t.status]}
                    </Badge>
                    <Badge color={PRIORITY_COLOR[t.priority]} variant="outline">
                      {t.priority}
                    </Badge>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>

        <div className="space-y-6">
          <Card>
            <CardHeader className="flex items-center justify-between flex-row">
              <CardTitle>Upcoming meetings</CardTitle>
              <Link
                href="/calendar"
                className="text-xs font-semibold text-[var(--c-teal)] flex items-center gap-1 hover:underline"
              >
                Calendar <ArrowRight className="h-3 w-3" />
              </Link>
            </CardHeader>
            <CardContent className="p-0">
              {upcomingEvents.length === 0 ? (
                <EmptyState
                  title="Nothing scheduled"
                  hint="Use the Calendar tab to add a meeting."
                />
              ) : (
                <ul className="divide-y">
                  {upcomingEvents.map((e) => (
                    <li key={e.id} className="p-4 hover:bg-slate-50">
                      <div className="flex items-start gap-3">
                        <div className="text-center shrink-0 w-12">
                          <div className="text-[10px] font-bold uppercase text-[var(--c-teal)]">
                            {format(e.startsAt, "MMM")}
                          </div>
                          <div className="text-2xl font-bold text-slate-900 leading-none">
                            {format(e.startsAt, "d")}
                          </div>
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="text-sm font-semibold text-slate-900 truncate">
                            {e.title}
                          </div>
                          <div className="flex items-center gap-1 text-xs text-slate-500 mt-0.5">
                            <Clock className="h-3 w-3" />
                            {format(e.startsAt, "HH:mm")} – {format(e.endsAt, "HH:mm")}
                            {e.student && <> · with {displayName(e.student)}</>}
                          </div>
                        </div>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>

          {role !== "student" && (
          <Card>
            <CardHeader>
              <CardTitle>Your students</CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              {students.length === 0 ? (
                <EmptyState
                  title="No students yet"
                  hint={
                    role === "supervisor"
                      ? "Add your first student from the Students tab."
                      : "You're not linked to any students yet."
                  }
                />
              ) : (
                <ul className="divide-y">
                  {students.slice(0, 6).map((s) => (
                    <li key={s.id}>
                      <Link
                        href={`/students/${s.id}`}
                        className="flex items-center gap-3 p-3 hover:bg-slate-50"
                      >
                        <Avatar
                          name={displayName(s)}
                          src={s.avatarUrl}
                          color={s.color}
                          size="sm"
                        />
                        <div className="flex-1 min-w-0">
                          <div className="text-sm font-medium text-slate-900 truncate">
                            {displayName(s)}
                          </div>
                          <div className="text-xs text-slate-500 truncate">
                            Year {s.programYear} · {s._count.tickets} tickets
                          </div>
                        </div>
                        <Badge
                          color={s.status === "active" ? "#00ca72" : "#94a3b8"}
                        >
                          {s.status}
                        </Badge>
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>
          )}
        </div>
      </div>
    </div>
  );
}

function EmptyState({ title, hint }: { title: string; hint: string }) {
  return (
    <div className="p-8 text-center">
      <div className="text-sm font-medium text-slate-700">{title}</div>
      <div className="text-xs text-slate-500 mt-1">{hint}</div>
    </div>
  );
}
