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
const PROJECT_RESEARCHER: Manual = {
  key: "project_researcher",
  label: "Project Researcher guide",
  file: "USER_MANUAL_PROJECT_RESEARCHER.md",
  desc: "For a postdoc/researcher embedded on a project with a student.",
  deck: "PhDapp_ProjectResearcher_Overview.pptx",
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
  //   Admin guide              → admin only
  //   Supervisor guide         → supervisors + admin
  //   Project Researcher guide → project researchers + supervisors + admin
  //   Student guide            → students + supervisors + admin
  // (`role === "admin"` is canonical — the admin email is promoted to that
  // role in auth.ts, the same check /admin uses. Co-supervisors, external
  // advisors, committee members and project researchers all carry the global
  // "supervisor" role, so the non-student/non-admin bucket is offered all of
  // the non-admin guides.)
  const manuals =
    role === "admin"
      ? [ADMIN, SUPERVISOR, PROJECT_RESEARCHER, STUDENT]
      : role === "student"
        ? [STUDENT]
        : [SUPERVISOR, PROJECT_RESEARCHER, STUDENT];

  return <HelpView manuals={manuals} />;
}
