import Link from "next/link";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { Avatar } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { displayName } from "@/lib/utils";
import {
  studentVisibilityWhereAllForAdmin,
  isSupervisingUser,
  isTeamAdvisorAnywhere,
  type Role,
} from "@/lib/access";
import { TeamUserCard } from "./user-edit-dialog";
import { TeamWorkspace } from "./team-workspace";
import { AdvisorSuggestions } from "./advisor-suggestions";
import { Shield } from "lucide-react";

const ROLE_COLOR: Record<string, string> = {
  supervisor: "#6f4cff",
  team_advisor: "#0ea5e9",
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
      coSupervisedStudents: { select: { id: true, studentId: true, role: true } },
      assignedTickets: {
        where: { status: { notIn: ["done"] }, archivedAt: null },
        select: { id: true },
      },
    },
  });

  // Every non-student user is shown in one unified "Team members" list with a
  // per-student role breakdown (one person can supervise A and team-advise B).
  // `supervisorUsers` is still derived for the Workload table — only people
  // who actually carry supervision load (primary, or CoSupervisor.role
  // supervisor/co_supervisor, or a plain global supervisor not yet linked).
  const memberUsers = users.filter((u) => u.role !== "student");
  const supervisorUsers: typeof users = [];
  for (const u of memberUsers) {
    const cosupRoles = new Set(u.coSupervisedStudents.map((c) => c.role));
    const primarySupervises = u.supervisedStudents.length > 0;
    const hasSupervisorLink =
      cosupRoles.has("supervisor") || cosupRoles.has("co_supervisor");
    const hasAnyLink =
      primarySupervises || u.coSupervisedStudents.length > 0;
    if (
      u.role === "admin" ||
      primarySupervises ||
      hasSupervisorLink ||
      !hasAnyLink // brand-new global supervisor with no links yet
    ) {
      supervisorUsers.push(u);
    }
  }

  // Students come from the Student table (so people who haven't signed in yet still appear).
  const studentRows = await prisma.student.findMany({
    where: studentVisibilityWhereAllForAdmin(session.user.id, role),
    include: {
      supervisor: { select: { id: true, name: true, email: true, color: true } },
      _count: { select: { tickets: { where: { archivedAt: null } } } },
    },
    orderBy: { fullName: "asc" },
  });
  const studentNameById = new Map(
    studentRows.map((s) => [s.id, displayName(s)]),
  );

  // Per-member relationship breakdown across students, by role. Resolve to
  // names the viewer can see (admins see all); unknown ids are summarised as
  // "+N more" so a non-admin supervisor doesn't learn names outside their view.
  function resolveNames(ids: string[]) {
    const named: string[] = [];
    let unknown = 0;
    for (const id of [...new Set(ids)]) {
      const n = studentNameById.get(id);
      if (n) named.push(n);
      else unknown++;
    }
    named.sort((a, b) => a.localeCompare(b));
    return { named, unknown };
  }
  const memberRelations = memberUsers.map((u) => {
    const supIds = [
      ...u.supervisedStudents.map((s) => s.id),
      ...u.coSupervisedStudents
        .filter((c) => c.role === "supervisor" || c.role === "co_supervisor")
        .map((c) => c.studentId),
    ];
    const taIds = u.coSupervisedStudents
      .filter((c) => c.role === "team_advisor")
      .map((c) => c.studentId);
    const extIds = u.coSupervisedStudents
      .filter((c) => c.role === "external_advisor")
      .map((c) => c.studentId);
    const commIds = u.coSupervisedStudents
      .filter((c) => c.role === "committee")
      .map((c) => c.studentId);
    return {
      userId: u.id,
      supervising: resolveNames(supIds),
      teamAdvising: resolveNames(taIds),
      externalAdvising: resolveNames(extIds),
      committee: resolveNames(commIds),
      counts: {
        supervising: new Set(supIds).size,
        teamAdvising: new Set(taIds).size,
        externalAdvising: new Set(extIds).size,
        committee: new Set(commIds).size,
      },
    };
  });
  const relationsByUser = new Map(
    memberRelations.map((r) => [r.userId, r]),
  );

  // ---- Supervisor team workspace (group-level, supervisors+admin only) ----
  const canWorkspace = await isSupervisingUser(session.user.id, role);
  const teamNotes = canWorkspace
    ? await prisma.teamNote.findMany({
        orderBy: { createdAt: "desc" },
        include: {
          author: { select: { id: true, name: true, image: true, color: true } },
        },
      })
    : [];
  const teamFolder = canWorkspace
    ? (await prisma.setting.findUnique({ where: { key: "teamDriveFolderUrl" } }))
        ?.value ?? null
    : null;

  // ---- Advisor suggestions thread (advisors → supervisors) ----
  const viewerIsTeamAdvisor = await isTeamAdvisorAnywhere(session.user.id);
  const canSeeSuggestions = canWorkspace || viewerIsTeamAdvisor || isAdmin;
  const canPostSuggestions = viewerIsTeamAdvisor || isAdmin;
  const suggestionRows = canSeeSuggestions
    ? await prisma.advisorSuggestion.findMany({
        orderBy: { createdAt: "desc" },
        take: 100,
        include: {
          author: { select: { id: true, name: true, image: true, color: true } },
        },
      })
    : [];
  const taggedIds = [
    ...new Set(suggestionRows.flatMap((r) => r.studentIds)),
  ];
  const taggedStudents = taggedIds.length
    ? await prisma.student.findMany({
        where: { id: { in: taggedIds } },
        select: { id: true, fullName: true, alias: true, color: true },
      })
    : [];
  const taggedById = new Map(taggedStudents.map((s) => [s.id, s]));
  if (canSeeSuggestions) {
    // Opening /team clears the Team sidebar bubble on the next poll.
    await prisma.user.update({
      where: { id: session.user.id },
      data: { teamSuggestionsLastSeenAt: new Date() },
    });
  }

  // ---- Workload aggregation (read-only) ----
  const studentStatus = new Map(studentRows.map((s) => [s.id, s.status]));
  const openTickets = await prisma.ticket.findMany({
    where: {
      status: { notIn: ["done"] },
      archivedAt: null,
      student: studentVisibilityWhereAllForAdmin(session.user.id, role),
    },
    select: { studentId: true, dueDate: true },
  });
  const now = new Date();
  const workload = supervisorUsers
    .map((u) => {
      const studentIds = new Set<string>([
        ...u.supervisedStudents.map((s) => s.id),
        ...u.coSupervisedStudents
          .filter((c) => c.role === "supervisor" || c.role === "co_supervisor")
          .map((c) => c.studentId),
      ]);
      const open = openTickets.filter((t) => studentIds.has(t.studentId));
      return {
        id: u.id,
        name: u.name ?? u.email,
        color: u.color,
        isAdmin: u.role === "admin",
        total: studentIds.size,
        active: [...studentIds].filter(
          (sid) => studentStatus.get(sid) === "active",
        ).length,
        openTasks: open.length,
        overdue: open.filter((t) => t.dueDate && t.dueDate < now).length,
        assigned: u.assignedTickets.length,
      };
    })
    .sort((a, b) => b.openTasks - a.openTasks);

  // Per-student load — who's drowning, who's idle.
  const studentWorkload = studentRows
    .map((s) => {
      const open = openTickets.filter((t) => t.studentId === s.id);
      return {
        id: s.id,
        name: displayName(s),
        color: s.color,
        avatarUrl: s.avatarUrl,
        supervisorName:
          s.supervisor?.name ?? s.supervisor?.email ?? "—",
        status: s.status,
        open: open.length,
        overdue: open.filter((t) => t.dueDate && t.dueDate < now).length,
      };
    })
    .sort((a, b) => b.open - a.open);

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

      {canWorkspace && (
        <TeamWorkspace
          viewerId={session.user.id}
          isAdmin={isAdmin}
          initialFolder={teamFolder}
          initialNotes={teamNotes.map((n) => ({
            id: n.id,
            body: n.body,
            createdAt: n.createdAt.toISOString(),
            author: n.author,
          }))}
        />
      )}

      {canSeeSuggestions && (
        <AdvisorSuggestions
          viewerId={session.user.id}
          canPost={canPostSuggestions}
          isAdmin={isAdmin}
          students={studentRows.map((s) => ({
            id: s.id,
            name: displayName(s),
            color: s.color,
          }))}
          initial={suggestionRows.map((r) => ({
            id: r.id,
            body: r.body,
            createdAt: r.createdAt.toISOString(),
            author: r.author,
            students: r.studentIds
              .map((sid) => taggedById.get(sid))
              .filter((s): s is NonNullable<typeof s> => !!s)
              .map((s) => ({
                id: s.id,
                name: s.alias?.trim() || s.fullName,
                color: s.color,
              })),
          }))}
        />
      )}

      <Card>
        <CardHeader>
          <CardTitle>Workload</CardTitle>
          <p className="text-xs text-slate-500 mt-1">
            Supervision load per supervisor — spot imbalance at a glance.
          </p>
        </CardHeader>
        <CardContent className="p-0 overflow-x-auto">
          {workload.length === 0 ? (
            <p className="p-6 text-sm text-slate-500">No supervisors yet.</p>
          ) : (
            <table className="w-full text-sm">
              <thead className="bg-slate-50 text-[10px] uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="px-4 py-2 text-left font-semibold">Supervisor</th>
                  <th className="px-4 py-2 text-right font-semibold">Students (active)</th>
                  <th className="px-4 py-2 text-right font-semibold">Open tasks</th>
                  <th className="px-4 py-2 text-right font-semibold">Overdue</th>
                  <th className="px-4 py-2 text-right font-semibold">Assigned to them</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {workload.map((w) => (
                  <tr key={w.id} className="hover:bg-slate-50">
                    <td className="px-4 py-2">
                      <div className="flex items-center gap-2">
                        <span
                          className="h-2.5 w-2.5 rounded-full shrink-0"
                          style={{ background: w.color }}
                        />
                        <span className="font-medium text-slate-900 truncate">
                          {w.name}
                        </span>
                        {w.isAdmin && (
                          <Badge color="#e2445c" variant="solid" className="!text-[9px] !py-0 !px-1.5">
                            admin
                          </Badge>
                        )}
                      </div>
                    </td>
                    <td className="px-4 py-2 text-right tabular-nums">
                      {w.total}{" "}
                      <span className="text-slate-400">({w.active} active)</span>
                    </td>
                    <td className="px-4 py-2 text-right tabular-nums">{w.openTasks}</td>
                    <td className="px-4 py-2 text-right tabular-nums">
                      {w.overdue > 0 ? (
                        <span className="font-semibold text-[var(--c-red)]">
                          {w.overdue}
                        </span>
                      ) : (
                        <span className="text-slate-400">0</span>
                      )}
                    </td>
                    <td className="px-4 py-2 text-right tabular-nums">{w.assigned}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Student workload</CardTitle>
          <p className="text-xs text-slate-500 mt-1">
            Open task load per student — spot who&apos;s overloaded or idle.
          </p>
        </CardHeader>
        <CardContent className="p-0 overflow-x-auto">
          {studentWorkload.length === 0 ? (
            <p className="p-6 text-sm text-slate-500">No students yet.</p>
          ) : (
            <table className="w-full text-sm">
              <thead className="bg-slate-50 text-[10px] uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="px-4 py-2 text-left font-semibold">Student</th>
                  <th className="px-4 py-2 text-left font-semibold">Supervisor</th>
                  <th className="px-4 py-2 text-left font-semibold">Status</th>
                  <th className="px-4 py-2 text-right font-semibold">Open tasks</th>
                  <th className="px-4 py-2 text-right font-semibold">Overdue</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {studentWorkload.map((s) => (
                  <tr key={s.id} className="hover:bg-slate-50">
                    <td className="px-4 py-2">
                      <Link
                        href={`/students/${s.id}`}
                        className="flex items-center gap-2 hover:underline"
                      >
                        <Avatar
                          name={s.name}
                          src={s.avatarUrl}
                          color={s.color}
                          size="xs"
                        />
                        <span className="font-medium text-slate-900 truncate">
                          {s.name}
                        </span>
                      </Link>
                    </td>
                    <td className="px-4 py-2 text-slate-600 truncate">
                      {s.supervisorName}
                    </td>
                    <td className="px-4 py-2">
                      <Badge
                        color={
                          s.status === "active" ? "#00ca72" : "#94a3b8"
                        }
                      >
                        {s.status.replace("_", " ")}
                      </Badge>
                    </td>
                    <td className="px-4 py-2 text-right tabular-nums">
                      {s.open}
                    </td>
                    <td className="px-4 py-2 text-right tabular-nums">
                      {s.overdue > 0 ? (
                        <span className="font-semibold text-[var(--c-red)]">
                          {s.overdue}
                        </span>
                      ) : (
                        <span className="text-slate-400">0</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle>Team members</CardTitle>
          <Badge color={ROLE_COLOR.supervisor} variant="solid">
            {memberUsers.length}
          </Badge>
        </CardHeader>
        <CardContent>
          <p className="text-xs text-slate-500 mb-3">
            Everyone with a role on at least one student. The same person can
            be a <span className="text-[var(--c-violet)]">supervisor</span> of
            one student and a{" "}
            <span className="text-sky-600">team advisor</span> of another —
            each row shows exactly who, for whom.
          </p>
          {memberUsers.length === 0 ? (
            <p className="text-sm text-slate-500">Nobody yet.</p>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {memberUsers.map((u) => {
                const rel = relationsByUser.get(u.id)!;
                const parts: string[] = [];
                if (rel.counts.supervising)
                  parts.push(`supervising ${rel.counts.supervising}`);
                if (rel.counts.teamAdvising)
                  parts.push(`team-advising ${rel.counts.teamAdvising}`);
                if (rel.counts.externalAdvising)
                  parts.push(`ext-advising ${rel.counts.externalAdvising}`);
                if (rel.counts.committee)
                  parts.push(`committee ${rel.counts.committee}`);
                const metric = parts.length
                  ? parts.join(" · ")
                  : "no students linked yet";
                return (
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
                    metric={metric}
                  >
                    <MemberBody
                      u={u}
                      isMe={u.id === session.user.id}
                      rel={rel}
                    />
                  </TeamUserCard>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

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
                      <span>{s._count.tickets} tasks</span>
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

type Resolved = { named: string[]; unknown: number };
type Rel = {
  userId: string;
  supervising: Resolved;
  teamAdvising: Resolved;
  externalAdvising: Resolved;
  committee: Resolved;
  counts: Record<string, number>;
};

function RelLine({
  label,
  color,
  r,
}: {
  label: string;
  color: string;
  r: Resolved;
}) {
  if (r.named.length === 0 && r.unknown === 0) return null;
  const names = r.named.join(", ");
  const more =
    r.unknown > 0 ? (names ? ` +${r.unknown} more` : `${r.unknown} student(s)`) : "";
  return (
    <div className="text-[10px] leading-snug">
      <span className="font-semibold" style={{ color }}>
        {label}:
      </span>{" "}
      <span className="text-slate-600">
        {names}
        {more}
      </span>
    </div>
  );
}

function MemberBody({
  u,
  isMe,
  rel,
}: {
  u: {
    id: string;
    name: string | null;
    email: string;
    image: string | null;
    color: string;
    role: string;
  };
  isMe: boolean;
  rel: Rel;
}) {
  const none =
    rel.supervising.named.length === 0 &&
    rel.supervising.unknown === 0 &&
    rel.teamAdvising.named.length === 0 &&
    rel.teamAdvising.unknown === 0 &&
    rel.externalAdvising.named.length === 0 &&
    rel.externalAdvising.unknown === 0 &&
    rel.committee.named.length === 0 &&
    rel.committee.unknown === 0;
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
        <div className="mt-1 space-y-0.5">
          <RelLine label="Supervisor of" color="#6f4cff" r={rel.supervising} />
          <RelLine label="Team advisor of" color="#0ea5e9" r={rel.teamAdvising} />
          <RelLine
            label="External advisor of"
            color="#00d1c1"
            r={rel.externalAdvising}
          />
          <RelLine label="Committee for" color="#a855f7" r={rel.committee} />
          {none && (
            <div className="text-[10px] text-slate-400">
              No students linked yet
            </div>
          )}
        </div>
      </div>
    </>
  );
}
