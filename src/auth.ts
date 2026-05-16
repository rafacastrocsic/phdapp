import NextAuth from "next-auth";
import Google from "next-auth/providers/google";
import { PrismaAdapter } from "@auth/prisma-adapter";
import { prisma } from "@/lib/prisma";

const adminEmail = (process.env.ADMIN_EMAIL ?? "rafael.castro.csic@gmail.com").trim().toLowerCase();

const supervisorEmails = (process.env.SUPERVISOR_EMAILS ?? "")
  .split(",")
  .map((s) => s.trim().toLowerCase())
  .filter(Boolean);

// CO_SUPERVISOR_EMAILS is kept for backward compatibility — anyone listed there
// is now treated as a supervisor (the co-supervisor concept was removed).
const legacyCoSupervisorEmails = (process.env.CO_SUPERVISOR_EMAILS ?? "")
  .split(",")
  .map((s) => s.trim().toLowerCase())
  .filter(Boolean);

export type AppRole = "admin" | "supervisor" | "student";

function roleFor(email?: string | null): AppRole {
  const e = (email ?? "").toLowerCase();
  if (e && e === adminEmail) return "admin";
  if (supervisorEmails.includes(e) || legacyCoSupervisorEmails.includes(e))
    return "supervisor";
  return "student";
}

const GOOGLE_SCOPES = [
  "openid",
  "email",
  "profile",
  "https://www.googleapis.com/auth/calendar",
  "https://www.googleapis.com/auth/drive",
].join(" ");

export const { handlers, auth, signIn, signOut } = NextAuth({
  adapter: PrismaAdapter(prisma),
  session: { strategy: "database" },
  trustHost: true,
  providers: [
    Google({
      clientId: process.env.AUTH_GOOGLE_ID,
      clientSecret: process.env.AUTH_GOOGLE_SECRET,
      // Safe here: Google is the only provider and verifies email ownership,
      // and the admin "add team member" flow pre-creates User rows (with no
      // linked Account) on purpose. Without this, those users hit
      // OAuthAccountNotLinked on their first sign-in.
      allowDangerousEmailAccountLinking: true,
      authorization: {
        params: {
          scope: GOOGLE_SCOPES,
          access_type: "offline",
          prompt: "consent",
        },
      },
    }),
  ],
  events: {
    async signIn({ user }) {
      if (!user?.email) return;
      const envRole = roleFor(user.email);
      const current = await prisma.user.findUnique({
        where: { email: user.email },
        select: { role: true },
      });
      // The env allowlists (ADMIN_EMAIL / SUPERVISOR_EMAILS) can only PROMOTE.
      // A role set deliberately in the DB (e.g. via the admin "add team
      // member" panel) must never be downgraded just because the email isn't
      // in an env var — otherwise pre-registered supervisors get reset to
      // "student" on every login.
      const rank: Record<AppRole, number> = {
        student: 0,
        supervisor: 1,
        admin: 2,
      };
      const currentRole = (current?.role as AppRole | undefined) ?? "student";
      const effectiveRole: AppRole =
        current && rank[currentRole] > rank[envRole] ? currentRole : envRole;
      if (current && current.role !== effectiveRole) {
        await prisma.user.update({
          where: { email: user.email },
          data: { role: effectiveRole },
        });
      }
      // Link to an existing Student record by email (supervisor added them already),
      // or auto-create a shell record otherwise. Keyed off the EFFECTIVE role so
      // supervisors never get a spurious Student record.
      if (effectiveRole === "student" && user.id) {
        const existing = await prisma.student.findFirst({
          where: { OR: [{ userId: user.id }, { email: user.email }] },
        });
        if (existing) {
          // Always sync: backfill userId, and keep avatar in sync with Google's.
          const data: Record<string, unknown> = {};
          if (!existing.userId) data.userId = user.id;
          // If we don't have a custom-uploaded student photo yet, copy from Google
          if (!existing.avatarUrl && user.image) data.avatarUrl = user.image;
          if (Object.keys(data).length > 0) {
            await prisma.student.update({
              where: { id: existing.id },
              data,
            });
          }
        } else {
          // Find any supervisor to attach this new student to. If none, skip.
          const sup = await prisma.user.findFirst({ where: { role: "supervisor" } });
          if (sup) {
            await prisma.student.create({
              data: {
                userId: user.id,
                fullName: user.name ?? user.email,
                email: user.email,
                avatarUrl: user.image ?? undefined,
                supervisorId: sup.id,
              },
            });
          }
        }
      }
    },
  },
  callbacks: {
    async session({ session, user }) {
      if (session.user) {
        (session.user as typeof session.user & { id: string; role: string }).id = user.id;
        const dbUser = await prisma.user.findUnique({
          where: { id: user.id },
          select: { role: true, color: true },
        });
        (session.user as typeof session.user & { id: string; role: AppRole }).role =
          (dbUser?.role as AppRole | undefined) ?? "student";
        (session.user as typeof session.user & { color?: string }).color =
          dbUser?.color ?? "#6366f1";
      }
      return session;
    },
  },
  pages: {
    signIn: "/signin",
  },
});
