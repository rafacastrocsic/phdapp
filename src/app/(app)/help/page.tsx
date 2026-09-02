import { auth } from "@/auth";
import { type Role } from "@/lib/access";
import { HelpView, type Manual } from "./help-view";

export const dynamic = "force-dynamic";

// The manuals live in docs/ (source of truth) and are copied to public/help/
// on every build by scripts/sync-help-docs.mjs, so the client can fetch them
// as static assets. Which ones a viewer is offered depends on their role.
const STUDENT: Manual = {
  key: "student",
  label: "Student guide",
  file: "USER_MANUAL_STUDENT.md",
  desc: "How to use PhDapp day to day as a student.",
  deck: "PhDapp_Student_Overview.pptx",
};
const SUPERVISOR: Manual = {
  key: "supervisor",
  label: "Supervisor guide",
  file: "USER_MANUAL_SUPERVISOR.md",
  desc: "For supervisors, co-supervisors, external advisors and committee members.",
  deck: "PhDapp_Supervisor_Overview.pptx",
};
const ADMIN: Manual = {
  key: "admin",
  label: "Admin guide",
  file: "USER_MANUAL_ADMIN.md",
  desc: "Running, deploying and maintaining PhDapp.",
};

export default async function HelpPage() {
  const session = (await auth())!;
  const role = session.user.role as Role;

  // Visibility matrix (broadest audience each guide is offered to):
  //   Admin guide      → admin only
  //   Supervisor guide → supervisors + admin
  //   Student guide    → students + supervisors + admin
  // (`role === "admin"` is canonical — the admin email is promoted to that
  // role in auth.ts, the same check /admin uses. Co-supervisors, external
  // advisors and committee members all carry the global "supervisor" role.)
  const manuals =
    role === "admin"
      ? [ADMIN, SUPERVISOR, STUDENT]
      : role === "student"
        ? [STUDENT]
        : [SUPERVISOR, STUDENT];

  return <HelpView manuals={manuals} />;
}
