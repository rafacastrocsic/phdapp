import { signIn, auth } from "@/auth";
import { redirect } from "next/navigation";
import { Sparkles, KanbanSquare, CalendarDays, FolderOpen, MessagesSquare, GraduationCap } from "lucide-react";

const FEATURES = [
  { icon: GraduationCap, label: "Per-student profiles", color: "var(--c-pink)" },
  { icon: KanbanSquare, label: "Task board", color: "var(--c-orange)" },
  { icon: CalendarDays, label: "Shared calendars", color: "var(--c-teal)" },
  { icon: FolderOpen, label: "Drive folders", color: "var(--c-blue)" },
  { icon: MessagesSquare, label: "In-app chat", color: "var(--c-green)" },
];

export default async function SignInPage() {
  const session = await auth();
  if (session?.user) redirect("/");

  const googleConfigured = !!process.env.AUTH_GOOGLE_ID;

  return (
    <div className="grid min-h-screen lg:grid-cols-2">
      <div className="hidden lg:flex relative flex-col justify-between brand-bg p-12 text-white overflow-hidden">
        <div className="absolute inset-0 dotgrid opacity-10" />
        <div className="relative">
          <div className="flex items-center gap-3 mb-12">
            <div className="h-10 w-10 rounded-xl bg-white/20 backdrop-blur flex items-center justify-center">
              <Sparkles className="h-5 w-5" />
            </div>
            <div className="text-xl font-bold">PhDapp</div>
          </div>
          <h1 className="text-5xl font-bold leading-tight">
            One colorful workspace<br />for supervising every<br />PhD student.
          </h1>
          <p className="mt-6 max-w-md text-lg text-white/85">
            Tickets, calendars, files and chat — all linked to each student,
            powered by your Google account.
          </p>
        </div>
        <div className="relative grid grid-cols-2 gap-3">
          {FEATURES.map(({ icon: Icon, label, color }) => (
            <div
              key={label}
              className="flex items-center gap-3 rounded-xl bg-white/10 backdrop-blur p-3"
            >
              <span
                className="flex h-8 w-8 items-center justify-center rounded-lg"
                style={{ background: color }}
              >
                <Icon className="h-4 w-4 text-white" />
              </span>
              <span className="text-sm font-medium">{label}</span>
            </div>
          ))}
        </div>
      </div>

      <div className="flex items-center justify-center p-8">
        <div className="w-full max-w-sm">
          <div className="lg:hidden flex items-center gap-2 mb-8">
            <div className="h-9 w-9 rounded-xl brand-bg flex items-center justify-center">
              <Sparkles className="h-5 w-5 text-white" />
            </div>
            <div className="text-xl font-bold brand-gradient">PhDapp</div>
          </div>

          <h2 className="text-3xl font-bold text-slate-900">Sign in</h2>
          <p className="mt-2 text-sm text-slate-500">
            Use your Google account. Supervisors and PhD students all sign in
            the same way.
          </p>

          {!googleConfigured ? (
            <div className="mt-8 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
              <strong>Google OAuth not configured.</strong>
              <p className="mt-1">
                Set <code>AUTH_GOOGLE_ID</code> and <code>AUTH_GOOGLE_SECRET</code> in
                <code> .env</code> and restart the dev server. See <code>README.md</code>.
              </p>
            </div>
          ) : (
            <form
              action={async () => {
                "use server";
                await signIn("google", { redirectTo: "/" });
              }}
              className="mt-8"
            >
              <button
                type="submit"
                className="flex h-11 w-full items-center justify-center gap-3 rounded-lg border bg-white text-sm font-medium text-slate-700 hover:bg-slate-50 transition-colors"
              >
                <GoogleLogo />
                Continue with Google
              </button>
            </form>
          )}

          <p className="mt-8 text-xs text-slate-400">
            By signing in you authorize PhDapp to read your Google Drive folders
            and read/write events on calendars you create here.
          </p>
        </div>
      </div>
    </div>
  );
}

function GoogleLogo() {
  return (
    <svg width="18" height="18" viewBox="0 0 48 48" aria-hidden>
      <path
        fill="#FFC107"
        d="M43.6 20.5H42V20H24v8h11.3C33.7 32.7 29.3 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.9 1.2 8 3.1l5.7-5.7C34.1 6.5 29.3 4.5 24 4.5 12.7 4.5 3.5 13.7 3.5 25S12.7 45.5 24 45.5 44.5 36.3 44.5 25c0-1.5-.2-3-.4-4.5z"
      />
      <path
        fill="#FF3D00"
        d="M6.3 14.7l6.6 4.8C14.7 15.1 19 12 24 12c3.1 0 5.9 1.2 8 3.1l5.7-5.7C34.1 6.5 29.3 4.5 24 4.5 16.3 4.5 9.7 8.6 6.3 14.7z"
      />
      <path
        fill="#4CAF50"
        d="M24 45.5c5.2 0 9.9-2 13.4-5.2l-6.2-5.2c-2 1.5-4.5 2.4-7.2 2.4-5.3 0-9.7-3.3-11.3-8l-6.5 5C9.6 41.4 16.3 45.5 24 45.5z"
      />
      <path
        fill="#1976D2"
        d="M43.6 20.5H42V20H24v8h11.3c-.8 2.3-2.3 4.2-4.1 5.6l6.2 5.2C41.4 36 44.5 31 44.5 25c0-1.5-.2-3-.4-4.5z"
      />
    </svg>
  );
}
