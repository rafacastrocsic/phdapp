import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { redirect } from "next/navigation";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Avatar } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { ProfileEditor } from "@/components/profile-editor";
import Link from "next/link";
import { Shield, Info, BarChart3 } from "lucide-react";
import { relativeTime } from "@/lib/utils";
import { AddTeamMember } from "./add-team-member";
import { MaintenanceTools } from "./maintenance";
import { GeneralCalendarSetting } from "./general-calendar-setting";

// The "Senior team" (everyone with the global `supervisor` role) is split by
// each person's actual per-student relationships. A person can wear several
// hats across students; they're shown once, in their most senior bucket
// (supervisor > team advisor > project researcher > external advisor >
// committee). Change a person's per-student role from the student's Manage
// team dialog — the global role menu below only sets admin/supervisor/student.
const SENIOR_CATS = [
  { key: "supervisor", label: "Supervisors", color: "#6f4cff" },
  { key: "team_advisor", label: "Team advisors", color: "#0ea5e9" },
  { key: "project_researcher", label: "Project researchers", color: "#f59e0b" },
  { key: "external_advisor", label: "External advisors", color: "#00d1c1" },
  { key: "committee", label: "Committee members", color: "#a855f7" },
] as const;

type AdminUser = {
  supervisedStudents: { id: string }[];
  coSupervisedStudents: { role: string }[];
};

function seniorCategory(u: AdminUser): string {
  const coRoles = new Set(u.coSupervisedStudents.map((c) => c.role));
  if (
    u.supervisedStudents.length > 0 ||
    coRoles.has("supervisor") ||
    coRoles.has("co_supervisor")
  )
    return "supervisor";
  if (coRoles.has("team_advisor")) return "team_advisor";
  if (coRoles.has("project_researcher")) return "project_researcher";
  if (coRoles.has("external_advisor")) return "external_advisor";
  if (coRoles.has("committee")) return "committee";
  return "supervisor"; // bare global-supervisor with no links yet
}

export default async function AdminPage() {
  const session = (await auth())!;
  if (session.user.role !== "admin") redirect("/");

  const studentOpts = await prisma.student.findMany({
    select: { id: true, fullName: true, alias: true },
    orderBy: { fullName: "asc" },
  });

  const users = await prisma.user.findMany({
    select: {
      id: true,
      name: true,
      email: true,
      image: true,
      color: true,
      role: true,
      linkedinUrl: true,
      orcidId: true,
      scholarUrl: true,
      alternateEmails: true,
      lastLoginAt: true,
      lastActiveAt: true,
      supervisedStudents: { select: { id: true } },
      coSupervisedStudents: { select: { role: true } },
      _count: {
        select: {
          supervisedStudents: true,
          coSupervisedStudents: true,
          assignedTickets: true,
        },
      },
    },
    orderBy: [{ role: "asc" }, { name: "asc" }],
  });

  const admins = users.filter((u) => u.role === "admin");
  const students = users.filter((u) => u.role === "student");
  const seniorBuckets: Record<string, typeof users> = {
    supervisor: [],
    team_advisor: [],
    project_researcher: [],
    external_advisor: [],
    committee: [],
  };
  for (const u of users)
    if (u.role === "supervisor") seniorBuckets[seniorCategory(u)].push(u);

  return (
    <div className="p-6 lg:p-8 space-y-6 max-w-5xl">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-3">
          <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-red-100 text-red-700">
            <Shield className="h-5 w-5" />
          </span>
          <div>
            <h1 className="text-2xl font-bold text-slate-900">Admin</h1>
            <p className="text-sm text-slate-500 mt-1">
              Edit any user&apos;s profile and role. Only the admin sees this page.
            </p>
          </div>
        </div>
        <Link
          href="/admin/metrics"
          className="inline-flex items-center gap-1.5 rounded-lg border bg-white px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"
        >
          <BarChart3 className="h-4 w-4 text-[var(--c-violet)]" /> Usage &
          adoption
        </Link>
      </div>

      <AddTeamMember students={studentOpts} />

      <GeneralCalendarSetting />

      <MaintenanceTools />

      <div className="rounded-xl border border-blue-200 bg-blue-50 p-4 flex gap-3">
        <Info className="h-5 w-5 text-blue-700 shrink-0 mt-0.5" />
        <div className="text-sm text-blue-900">
          <strong>Two ways to onboard people.</strong>
          <ul className="list-disc list-inside mt-1.5 space-y-0.5 text-blue-800">
            <li>
              <strong>Add directly (above):</strong> creates a User record
              immediately. Great for external advisors / committee members who
              may not log in.
            </li>
            <li>
              <strong>Google sign-in:</strong> send them the app URL — they click
              <em> Continue with Google</em>, approve Drive + Calendar, and show
              up here as a <em>student</em>. You then change the role.
            </li>
          </ul>
          <p className="mt-1.5 text-blue-800 text-xs">
            (Tip: while the OAuth app is in <em>testing</em> mode in Google Cloud,
            add their email to the test-users list first.)
          </p>
        </div>
      </div>

      <MemberCard
        title="Administrators"
        color="#e2445c"
        users={admins}
        sessionUserId={session.user.id}
      />

      <div className="space-y-4">
        <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
          <h2 className="text-lg font-bold text-slate-900">Senior team</h2>
          <span className="text-xs text-slate-400">
            Everyone with the supervisor sign-in role, grouped by what they do
            per student. Change a person&apos;s per-student role from that
            student&apos;s <em>Manage team</em> dialog.
          </span>
        </div>
        {SENIOR_CATS.map((cat) => (
          <MemberCard
            key={cat.key}
            title={cat.label}
            color={cat.color}
            users={seniorBuckets[cat.key]}
            sessionUserId={session.user.id}
          />
        ))}
      </div>

      <MemberCard
        title="Students"
        color="#ff7a45"
        users={students}
        sessionUserId={session.user.id}
      />
    </div>
  );
}

type MemberUser = {
  id: string;
  name: string | null;
  email: string;
  image: string | null;
  color: string;
  role: string;
  linkedinUrl: string | null;
  orcidId: string | null;
  scholarUrl: string | null;
  alternateEmails: string | null;
  lastLoginAt: Date | null;
  lastActiveAt: Date | null;
  _count: {
    supervisedStudents: number;
    coSupervisedStudents: number;
    assignedTickets: number;
  };
};

function MemberCard({
  title,
  color,
  users,
  sessionUserId,
}: {
  title: string;
  color: string;
  users: MemberUser[];
  sessionUserId: string;
}) {
  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle>{title}</CardTitle>
        <Badge color={color} variant="solid">
          {users.length}
        </Badge>
      </CardHeader>
      <CardContent className="p-0">
        {users.length === 0 ? (
          <p className="p-6 text-sm text-slate-500">Nobody yet.</p>
        ) : (
          <ul className="divide-y">
            {users.map((u) => (
              <UserRow key={u.id} u={u} isSelf={u.id === sessionUserId} />
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}

function UserRow({ u, isSelf }: { u: MemberUser; isSelf: boolean }) {
  return (
    <li className="p-4">
      <details>
        <summary className="cursor-pointer flex items-center gap-3 list-none">
          <Avatar name={u.name} src={u.image} color={u.color} size="md" />
          <div className="flex-1 min-w-0">
            <div className="text-sm font-semibold text-slate-900 truncate">
              {u.name ?? u.email}
              {isSelf && (
                <span className="ml-1 text-xs text-slate-400">(you)</span>
              )}
            </div>
            <div className="text-xs text-slate-500 truncate">{u.email}</div>
            <UserActivityLine
              lastLoginAt={u.lastLoginAt}
              lastActiveAt={u.lastActiveAt}
            />
          </div>
          <div className="hidden sm:flex items-center gap-3 text-xs text-slate-500">
            {u._count.supervisedStudents > 0 && (
              <span><strong className="text-slate-900">{u._count.supervisedStudents}</strong> sup</span>
            )}
            {u._count.coSupervisedStudents > 0 && (
              <span><strong className="text-slate-900">{u._count.coSupervisedStudents}</strong> shared</span>
            )}
            {u._count.assignedTickets > 0 && (
              <span><strong className="text-slate-900">{u._count.assignedTickets}</strong> tasks</span>
            )}
          </div>
          <span className="text-xs text-slate-400 ml-2">click to edit</span>
        </summary>
        <div className="mt-4 pt-4 border-t">
          <ProfileEditor user={u} canEditRole isSelf={isSelf} />
        </div>
      </details>
    </li>
  );
}

/**
 * Tiny admin-only summary line: when did this user last log in / last
 * browse the app? Renders nothing for users who've never signed in
 * (lastLoginAt = NULL), so a fresh "Add team member" row looks clean.
 *
 * Threshold for "online": active in the last 10 minutes. The bumper
 * helper writes every ~5 min while the user is browsing, so two
 * consecutive bumps cover the window.
 */
function UserActivityLine({
  lastLoginAt,
  lastActiveAt,
}: {
  lastLoginAt: Date | null;
  lastActiveAt: Date | null;
}) {
  if (!lastLoginAt && !lastActiveAt) {
    return (
      <div className="text-[11px] text-slate-400 italic">
        Never signed in
      </div>
    );
  }
  const now = Date.now();
  const isOnline =
    lastActiveAt && now - lastActiveAt.getTime() < 10 * 60_000;
  const pieces: React.ReactNode[] = [];
  if (isOnline) {
    pieces.push(
      <span key="online" className="text-[var(--c-green)] font-medium">
        ● Active now
      </span>,
    );
  } else if (lastActiveAt) {
    pieces.push(<span key="active">Active {relativeTime(lastActiveAt)}</span>);
  }
  if (lastLoginAt) {
    pieces.push(
      <span key="login" className="text-slate-400">
        Last login {relativeTime(lastLoginAt)}
      </span>,
    );
  }
  return (
    <div className="text-[11px] text-slate-500 mt-0.5 flex gap-2 flex-wrap">
      {pieces.flatMap((p, i) =>
        i === 0
          ? [p]
          : [
              <span key={`sep-${i}`} className="text-slate-300">·</span>,
              p,
            ],
      )}
    </div>
  );
}
