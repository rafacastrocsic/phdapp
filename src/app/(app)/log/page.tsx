import Link from "next/link";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { isSupervisingUser, studentVisibilityWhereAllForAdmin, type Role } from "@/lib/access";
import { LogAdminControls } from "./admin-controls";
import { redirect } from "next/navigation";
import { Avatar } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { format } from "date-fns";
import { displayName, relativeTime } from "@/lib/utils";
import {
  KanbanSquare,
  CalendarDays,
  GraduationCap,
  Plus,
  Pencil,
  Trash2,
  ImageIcon,
} from "lucide-react";

const ACTION_LABELS: Record<string, { label: string; color: string; icon: typeof KanbanSquare }> = {
  "ticket.create": { label: "Created task", color: "#00ca72", icon: Plus },
  "ticket.update": { label: "Updated task", color: "#2196f3", icon: Pencil },
  "ticket.delete": { label: "Deleted task", color: "#e2445c", icon: Trash2 },
  "event.create": { label: "Created event", color: "#00d1c1", icon: Plus },
  "event.update": { label: "Updated event", color: "#2196f3", icon: Pencil },
  "event.delete": { label: "Deleted event", color: "#e2445c", icon: Trash2 },
  "student.update": { label: "Updated profile", color: "#a855f7", icon: Pencil },
  "student.avatar": { label: "Changed photo", color: "#ec4899", icon: ImageIcon },
  "student.delete": { label: "Deleted student", color: "#e2445c", icon: Trash2 },
};

const ROLE_COLOR: Record<string, string> = {
  student: "#ff7a45",
  supervisor: "#6f4cff",
  admin: "#e2445c",
};

export default async function LogBookPage({
  searchParams,
}: {
  searchParams: Promise<{ student?: string; actor?: string }>;
}) {
  const sp = await searchParams;
  const session = (await auth())!;
  const role = session.user.role as Role;

  // External advisors / committee-only users don't get a Log Book.
  const isSupervising = await isSupervisingUser(session.user.id, role);
  if (role !== "student" && role !== "admin" && !isSupervising) {
    redirect("/");
  }

  // Visibility filter on logs:
  //  - admin: all logs (no filter)
  //  - student: their own actions only
  //  - real supervisor: actions on their supervised students + their own actions
  let logFilter: Record<string, unknown> = {};
  if (role === "student") {
    logFilter = { actorId: session.user.id };
  } else if (role === "admin") {
    // no filter
  } else {
    const sup = await prisma.student.findMany({
      where: studentVisibilityWhereAllForAdmin(session.user.id, role),
      select: { id: true },
    });
    const supIds = sup.map((s) => s.id);
    logFilter = {
      OR: [
        { studentId: { in: supIds } },
        { actorId: session.user.id },
      ],
    };
  }

  // For dropdown / labels, fetch the students the viewer can see
  const students =
    role === "student"
      ? []
      : await prisma.student.findMany({
          where: studentVisibilityWhereAllForAdmin(session.user.id, role),
          select: { id: true, fullName: true, alias: true, color: true },
          orderBy: { fullName: "asc" },
        });
  void students;

  const logs = await prisma.activityLog.findMany({
    where: {
      ...logFilter,
      ...(sp.student ? { studentId: sp.student } : {}),
      ...(sp.actor ? { actorId: sp.actor } : {}),
    },
    include: {
      actor: { select: { id: true, name: true, email: true, image: true, color: true } },
      student: { select: { id: true, fullName: true, alias: true, color: true } },
    },
    orderBy: { createdAt: "desc" },
    take: 500,
  });

  // Group by day
  const byDay: Record<string, typeof logs> = {};
  for (const l of logs) {
    const key = format(l.createdAt, "EEEE · MMM d, yyyy");
    (byDay[key] ??= []).push(l);
  }

  return (
    <div className="p-6 lg:p-8 space-y-6">
      <div className="flex items-end justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Log book</h1>
          <p className="text-sm text-slate-500 mt-1">
            {role === "student"
              ? "A record of every action you took in PhDapp."
              : role === "admin"
              ? "Every action by every user. Use the buttons to export or wipe the history."
              : "Actions on your supervised students plus your own actions."}
          </p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          {(sp.student || sp.actor) && (
            <Link
              href="/log"
              className="text-xs font-semibold text-[var(--c-violet)] hover:underline"
            >
              Clear filters
            </Link>
          )}
          {role === "admin" && <LogAdminControls />}
        </div>
      </div>

      {logs.length === 0 ? (
        <Card>
          <CardContent className="p-12 text-center">
            <div className="text-base font-semibold text-slate-700">
              No activity yet
            </div>
            <p className="text-sm text-slate-500 mt-1">
              When students or other team members make changes, they&apos;ll show up here.
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-6">
          {Object.entries(byDay).map(([day, items]) => (
            <Card key={day}>
              <CardHeader>
                <CardTitle>{day}</CardTitle>
              </CardHeader>
              <CardContent className="p-0">
                <ul className="divide-y">
                  {items.map((l) => {
                    const meta = ACTION_LABELS[l.action] ?? {
                      label: l.action,
                      color: "#94a3b8",
                      icon: KanbanSquare,
                    };
                    const Icon = meta.icon;
                    return (
                      <li
                        key={l.id}
                        className="flex items-start gap-3 p-4 hover:bg-slate-50"
                      >
                        <span
                          className="flex h-8 w-8 items-center justify-center rounded-lg shrink-0"
                          style={{ background: `${meta.color}1f`, color: meta.color }}
                        >
                          <Icon className="h-4 w-4" />
                        </span>
                        <div className="flex-1 min-w-0">
                          <div className="text-sm text-slate-800">
                            <Link
                              href={`/log?actor=${l.actorId}`}
                              className="font-semibold text-slate-900 hover:underline"
                            >
                              {l.actor.name ?? l.actor.email}
                            </Link>{" "}
                            <Badge
                              color={ROLE_COLOR[l.actorRoleAtTime] ?? "#94a3b8"}
                              className="!text-[10px]"
                            >
                              {l.actorRoleAtTime.replace("_", " ")}
                            </Badge>{" "}
                            <span>{l.summary}</span>
                          </div>
                          <div className="text-xs text-slate-500 mt-1 flex items-center gap-2 flex-wrap">
                            <span>{format(l.createdAt, "HH:mm")}</span>
                            <span>·</span>
                            <span>{relativeTime(l.createdAt)}</span>
                            {l.student && (
                              <>
                                <span>·</span>
                                <Link
                                  href={`/students/${l.student.id}`}
                                  className="flex items-center gap-1 hover:underline"
                                >
                                  <Avatar
                                    name={displayName(l.student)}
                                    color={l.student.color}
                                    size="xs"
                                  />
                                  <span className="font-medium text-slate-700">
                                    {displayName(l.student)}
                                  </span>
                                </Link>
                                <span>·</span>
                                <Link
                                  href={`/log?student=${l.student.id}`}
                                  className="text-[10px] text-slate-400 hover:text-slate-700"
                                >
                                  filter
                                </Link>
                              </>
                            )}
                            {l.entityType === "ticket" && l.entityId && (
                              <>
                                <span>·</span>
                                <Link
                                  href={`/kanban?ticket=${l.entityId}`}
                                  className="flex items-center gap-1 text-[var(--c-orange)] hover:underline"
                                >
                                  <KanbanSquare className="h-3 w-3" /> open task
                                </Link>
                              </>
                            )}
                            {l.entityType === "event" && l.entityId && (
                              <>
                                <span>·</span>
                                <Link
                                  href={`/calendar`}
                                  className="flex items-center gap-1 text-[var(--c-teal)] hover:underline"
                                >
                                  <CalendarDays className="h-3 w-3" /> open calendar
                                </Link>
                              </>
                            )}
                            {l.entityType === "student" && l.entityId && (
                              <>
                                <span>·</span>
                                <Link
                                  href={`/students/${l.entityId}`}
                                  className="flex items-center gap-1 text-[var(--c-pink)] hover:underline"
                                >
                                  <GraduationCap className="h-3 w-3" /> open profile
                                </Link>
                              </>
                            )}
                          </div>
                        </div>
                        <Avatar
                          name={l.actor.name}
                          src={l.actor.image}
                          color={l.actor.color}
                          size="sm"
                        />
                      </li>
                    );
                  })}
                </ul>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
