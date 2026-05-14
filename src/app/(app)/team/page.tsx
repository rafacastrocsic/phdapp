import Link from "next/link";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { Avatar } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { displayName } from "@/lib/utils";
import { studentVisibilityWhereAllForAdmin, type Role } from "@/lib/access";
import { TeamUserCard } from "./user-edit-dialog";
import { Shield } from "lucide-react";

const ROLE_COLOR: Record<string, string> = {
  supervisor: "#6f4cff",
  external_advisor: "#00d1c1",
  committee: "#a855f7",
  student: "#ff7a45",
};

export default async function TeamPage() {
  const session = (await auth())!;
  const role = session.user.role as Role;
  if (role === "student") {
    const { redirect } = await import("next/navigation");
    redirect("/");
  }
  const isAdmin = role === "admin";

  const users = await prisma.user.findMany({
    orderBy: [{ role: "asc" }, { name: "asc" }],
    include: {
      supervisedStudents: { select: { id: true } },
      coSupervisedStudents: { select: { id: true, role: true } },
      assignedTickets: { where: { status: { notIn: ["done"] } }, select: { id: true } },
    },
  });

  // Categorize each user by their effective relationship roles across all students.
  // A user is a Supervisor if they primary-supervise anyone, OR have any CoSupervisor
  // row with role=supervisor. Otherwise they're classified by their additional roles
  // (external_advisor / committee) — falling back to Supervisor for plain global
  // role=supervisor with no links yet.
  const supervisorUsers: typeof users = [];
  const externalAdvisors: typeof users = [];
  const committee: typeof users = [];

  for (const u of users) {
    if (u.role === "student") continue;
    const cosupRoles = new Set(u.coSupervisedStudents.map((c) => c.role));
    const primarySupervises = u.supervisedStudents.length > 0;
    const hasSupervisorLink = cosupRoles.has("supervisor") || cosupRoles.has("co_supervisor");
    const hasExternalLink = cosupRoles.has("external_advisor");
    const hasCommitteeLink = cosupRoles.has("committee");

    if (u.role === "admin" || primarySupervises || hasSupervisorLink) {
      supervisorUsers.push(u);
    } else if (hasExternalLink) {
      externalAdvisors.push(u);
    } else if (hasCommitteeLink) {
      committee.push(u);
    } else {
      // No links anywhere yet → bucket by global role
      supervisorUsers.push(u);
    }
  }

  // Students come from the Student table (so people who haven't signed in yet still appear).
  const studentRows = await prisma.student.findMany({
    where: studentVisibilityWhereAllForAdmin(session.user.id, role),
    include: {
      supervisor: { select: { id: true, name: true, email: true, color: true } },
      _count: { select: { tickets: true } },
    },
    orderBy: { fullName: "asc" },
  });

  return (
    <div className="p-6 lg:p-8 space-y-6">
      <div className="flex items-end justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Team</h1>
          <p className="text-sm text-slate-500 mt-1">
            Everyone connected to your supervision workspace.
          </p>
        </div>
        {isAdmin && (
          <Link href="/admin">
            <Button variant="danger" size="sm">
              <Shield className="h-4 w-4" /> Admin panel
            </Button>
          </Link>
        )}
      </div>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle>Supervisors</CardTitle>
          <Badge color={ROLE_COLOR.supervisor} variant="solid">
            {supervisorUsers.length}
          </Badge>
        </CardHeader>
        <CardContent>
          {supervisorUsers.length === 0 ? (
            <p className="text-sm text-slate-500">Nobody yet.</p>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {supervisorUsers.map((u) => (
                <TeamUserCard
                  key={u.id}
                  user={{
                    id: u.id,
                    name: u.name,
                    email: u.email,
                    image: u.image,
                    color: u.color,
                    role: u.role,
                  }}
                  isMe={u.id === session.user.id}
                  isAdmin={isAdmin}
                  metric={`${u.supervisedStudents.length} student${u.supervisedStudents.length === 1 ? "" : "s"}`}
                >
                  <UserCardBody u={u} isMe={u.id === session.user.id} metric={`${u.supervisedStudents.length} students`} />
                </TeamUserCard>
              ))}
            </div>
          )}
        </CardContent>
      </Card>


      {externalAdvisors.length > 0 && (
        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle>External advisors</CardTitle>
            <Badge color={ROLE_COLOR.external_advisor} variant="solid">
              {externalAdvisors.length}
            </Badge>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {externalAdvisors.map((u) => (
                <TeamUserCard
                  key={u.id}
                  user={{
                    id: u.id,
                    name: u.name,
                    email: u.email,
                    image: u.image,
                    color: u.color,
                    role: u.role,
                  }}
                  isMe={u.id === session.user.id}
                  isAdmin={isAdmin}
                  metric={`advising ${u.coSupervisedStudents.filter((c) => c.role === "external_advisor").length} student${u.coSupervisedStudents.filter((c) => c.role === "external_advisor").length === 1 ? "" : "s"}`}
                >
                  <UserCardBody
                    u={u}
                    isMe={u.id === session.user.id}
                    metric={`advising ${u.coSupervisedStudents.filter((c) => c.role === "external_advisor").length}`}
                  />
                </TeamUserCard>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {committee.length > 0 && (
        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle>Committee members</CardTitle>
            <Badge color={ROLE_COLOR.committee} variant="solid">
              {committee.length}
            </Badge>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {committee.map((u) => (
                <TeamUserCard
                  key={u.id}
                  user={{
                    id: u.id,
                    name: u.name,
                    email: u.email,
                    image: u.image,
                    color: u.color,
                    role: u.role,
                  }}
                  isMe={u.id === session.user.id}
                  isAdmin={isAdmin}
                  metric={`on ${u.coSupervisedStudents.filter((c) => c.role === "committee").length} committee${u.coSupervisedStudents.filter((c) => c.role === "committee").length === 1 ? "" : "s"}`}
                >
                  <UserCardBody
                    u={u}
                    isMe={u.id === session.user.id}
                    metric={`on ${u.coSupervisedStudents.filter((c) => c.role === "committee").length} committees`}
                  />
                </TeamUserCard>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle>PhD students</CardTitle>
          <Badge color={ROLE_COLOR.student} variant="solid">
            {studentRows.length}
          </Badge>
        </CardHeader>
        <CardContent>
          {studentRows.length === 0 ? (
            <p className="text-sm text-slate-500">No students yet.</p>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {studentRows.map((s) => (
                <Link
                  key={s.id}
                  href={`/students/${s.id}`}
                  className="flex items-center gap-3 rounded-xl border p-3 hover:shadow-sm transition-shadow"
                >
                  <Avatar
                    name={displayName(s)}
                    src={s.avatarUrl}
                    color={s.color}
                    size="md"
                  />
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-semibold text-slate-900 truncate">
                      {displayName(s)}
                    </div>
                    <div className="text-xs text-slate-500 truncate">{s.email}</div>
                    <div className="text-[10px] text-slate-500 mt-0.5 flex items-center gap-2">
                      <span>Year {s.programYear}</span>
                      <span>·</span>
                      <span>{s._count.tickets} tickets</span>
                      {!s.userId && (
                        <Badge color="#94a3b8" className="!text-[9px]">
                          not signed in
                        </Badge>
                      )}
                    </div>
                  </div>
                </Link>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function UserCardBody({
  u,
  metric,
  isMe,
}: {
  u: {
    id: string;
    name: string | null;
    email: string;
    image: string | null;
    color: string;
    role: string;
  };
  metric: string;
  isMe: boolean;
}) {
  return (
    <>
      <Avatar name={u.name} src={u.image} color={u.color} size="md" />
      <div className="flex-1 min-w-0">
        <div className="text-sm font-semibold text-slate-900 truncate flex items-center gap-1.5">
          <span className="truncate">{u.name ?? u.email}</span>
          {u.role === "admin" && (
            <Badge color="#e2445c" variant="solid" className="!text-[9px] !py-0 !px-1.5">
              admin
            </Badge>
          )}
          {isMe && <span className="text-xs text-slate-400">(you)</span>}
        </div>
        <div className="text-xs text-slate-500 truncate">{u.email}</div>
        <div className="text-[10px] text-slate-500 mt-0.5">{metric}</div>
      </div>
    </>
  );
}
