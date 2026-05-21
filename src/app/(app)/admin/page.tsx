import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { redirect } from "next/navigation";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Avatar } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { ProfileEditor } from "@/components/profile-editor";
import { Shield, Info } from "lucide-react";
import { relativeTime } from "@/lib/utils";
import { AddTeamMember } from "./add-team-member";
import { MaintenanceTools } from "./maintenance";
import { GeneralCalendarSetting } from "./general-calendar-setting";

const ROLE_GROUPS = ["admin", "supervisor", "student"] as const;
const ROLE_LABEL: Record<string, string> = {
  admin: "Administrators",
  supervisor: "Supervisors",
  student: "Students",
};
const ROLE_COLOR: Record<string, string> = {
  admin: "#e2445c",
  supervisor: "#6f4cff",
  student: "#ff7a45",
};

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
      lastLoginAt: true,
      lastActiveAt: true,
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

  const grouped: Record<string, typeof users> = {
    admin: [],
    supervisor: [],
    student: [],
  };
  for (const u of users) (grouped[u.role] ??= []).push(u);

  return (
    <div className="p-6 lg:p-8 space-y-6 max-w-5xl">
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

      {ROLE_GROUPS.map((role) => (
        <Card key={role}>
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle>{ROLE_LABEL[role]}</CardTitle>
            <Badge color={ROLE_COLOR[role]} variant="solid">
              {grouped[role].length}
            </Badge>
          </CardHeader>
          <CardContent className="p-0">
            {grouped[role].length === 0 ? (
              <p className="p-6 text-sm text-slate-500">Nobody yet.</p>
            ) : (
              <ul className="divide-y">
                {grouped[role].map((u) => (
                  <li key={u.id} className="p-4">
                    <details>
                      <summary className="cursor-pointer flex items-center gap-3 list-none">
                        <Avatar
                          name={u.name}
                          src={u.image}
                          color={u.color}
                          size="md"
                        />
                        <div className="flex-1 min-w-0">
                          <div className="text-sm font-semibold text-slate-900 truncate">
                            {u.name ?? u.email}
                            {u.id === session.user.id && (
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
                        <ProfileEditor
                          user={u}
                          canEditRole
                          isSelf={u.id === session.user.id}
                        />
                      </div>
                    </details>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      ))}
    </div>
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
