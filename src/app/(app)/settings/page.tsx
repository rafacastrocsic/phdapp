import { auth, signOut } from "@/auth";
import { prisma } from "@/lib/prisma";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Check, AlertTriangle, LogOut } from "lucide-react";
import { ProfileEditor } from "@/components/profile-editor";
import { DigestToggle } from "./digest-toggle";

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
    },
  });

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
