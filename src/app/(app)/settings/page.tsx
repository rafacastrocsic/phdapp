import type { ReactNode } from "react";
import { auth, signOut } from "@/auth";
import { prisma } from "@/lib/prisma";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Check,
  AlertTriangle,
  LogOut,
  FolderOpen,
  CalendarDays,
  ExternalLink,
  Info,
} from "lucide-react";
import { ProfileEditor } from "@/components/profile-editor";
import { DigestToggle } from "./digest-toggle";
import { isProjectResearcherAnywhere } from "@/lib/access";

export default async function SettingsPage() {
  const session = (await auth())!;

  const me = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: {
      id: true,
      name: true,
      email: true,
      image: true,
      color: true,
      role: true,
      emailDigest: true,
      linkedinUrl: true,
      orcidId: true,
      scholarUrl: true,
      alternateEmails: true,
      driveFolderId: true,
      calendarId: true,
    },
  });
  const isProjectResearcher = await isProjectResearcherAnywhere(session.user.id);

  const account = await prisma.account.findFirst({
    where: { userId: session.user.id, provider: "google" },
    select: { scope: true, expires_at: true },
  });

  const hasDrive = account?.scope?.includes("drive") ?? false;
  const hasCal = account?.scope?.includes("calendar") ?? false;
  const isAdmin = session.user.role === "admin";

  return (
    <div className="p-6 lg:p-8 space-y-6 max-w-3xl">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Settings</h1>
          <p className="text-sm text-slate-500 mt-1">
            Your account and connected services.
          </p>
        </div>
        <form
          action={async () => {
            "use server";
            await signOut({ redirectTo: "/signin" });
          }}
        >
          <Button variant="outline" type="submit">
            <LogOut className="h-4 w-4" /> Sign out
          </Button>
        </form>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>My profile</CardTitle>
        </CardHeader>
        <CardContent>
          {me ? (
            <ProfileEditor
              user={me}
              canEditRole={isAdmin}
              isSelf
            />
          ) : (
            <p className="text-sm text-slate-500">Could not load your profile.</p>
          )}
        </CardContent>
      </Card>

      {me && session.user.role !== "student" && (
        <Card>
          <CardHeader>
            <CardTitle>Notifications</CardTitle>
          </CardHeader>
          <CardContent>
            <DigestToggle initial={me.emailDigest} />
          </CardContent>
        </Card>
      )}

      {me && isProjectResearcher && (
        <Card>
          <CardHeader>
            <CardTitle>My workspace</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex items-start gap-2 rounded-lg bg-blue-50 p-3 text-sm text-blue-900">
              <Info className="mt-0.5 h-4 w-4 shrink-0 text-blue-700" />
              <span>
                Your project <strong>Drive folder</strong> and{" "}
                <strong>calendar</strong> are set up for you by a supervisor or
                the admin (from the <strong>Team</strong> page) and shared
                view-only with the students you work with and their teams. You
                don&apos;t create them here — ask your supervisor if a link is
                missing.
              </span>
            </div>
            <WorkspaceLink
              icon={<FolderOpen className="h-4 w-4 text-[var(--c-blue)]" />}
              label="Drive folder"
              href={
                me.driveFolderId
                  ? `https://drive.google.com/drive/folders/${me.driveFolderId}`
                  : null
              }
            />
            <WorkspaceLink
              icon={<CalendarDays className="h-4 w-4 text-[var(--c-teal)]" />}
              label="Calendar"
              href={
                me.calendarId
                  ? `https://calendar.google.com/calendar/u/0/r?cid=${Buffer.from(
                      me.calendarId,
                    ).toString("base64")}`
                  : null
              }
            />
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Google integration</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <CheckRow ok={hasDrive} label="Drive — read your folders and files" />
          <CheckRow ok={hasCal} label="Calendar — read and create events" />
          <p className="text-xs text-slate-500 pt-2">
            If a scope is missing, sign out and sign in again. You may need to
            re-approve the OAuth consent screen.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}

function WorkspaceLink({
  icon,
  label,
  href,
}: {
  icon: ReactNode;
  label: string;
  href: string | null;
}) {
  return (
    <div className="flex items-center justify-between gap-3 rounded-lg border px-3 py-2">
      <span className="flex items-center gap-2 text-sm text-slate-700">
        {icon}
        {label}
      </span>
      {href ? (
        <a
          href={href}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1 text-sm font-medium text-[var(--c-violet)] hover:underline"
        >
          <ExternalLink className="h-3.5 w-3.5" /> Open
        </a>
      ) : (
        <span className="text-xs text-slate-400">Not set up yet</span>
      )}
    </div>
  );
}

function CheckRow({ ok, label }: { ok: boolean; label: string }) {
  return (
    <div className="flex items-center gap-3">
      {ok ? (
        <span className="flex h-7 w-7 items-center justify-center rounded-full bg-green-100 text-green-700">
          <Check className="h-4 w-4" />
        </span>
      ) : (
        <span className="flex h-7 w-7 items-center justify-center rounded-full bg-amber-100 text-amber-700">
          <AlertTriangle className="h-4 w-4" />
        </span>
      )}
      <span className="text-sm text-slate-700">{label}</span>
    </div>
  );
}
