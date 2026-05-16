import Link from "next/link";
import { notFound } from "next/navigation";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import {
  accessForStudent,
  canDeleteStudent,
  canEditStudentProfile,
  canManageTeam,
  studentVisibilityWhereAllForAdmin,
  teamLevelForStudent,
  canSeeSupervisorPrivate,
  type Role,
} from "@/lib/access";
import { ThesisPublications } from "./thesis-publications";
import { SupervisorNotes } from "./supervisor-notes";
import { Avatar } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  CalendarDays,
  FolderOpen,
  MessagesSquare,
  ScrollText,
  KanbanSquare,
  ExternalLink,
  Mail,
  GraduationCap,
  Globe,
  BookOpen,
  Star,
  FileText,
  FileSpreadsheet,
  Image as ImageIcon,
  File as FileIcon,
} from "lucide-react";

function Linkedin({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="currentColor"
      aria-hidden
      className={className}
    >
      <path d="M20.45 20.45h-3.55v-5.57c0-1.33-.03-3.05-1.86-3.05-1.86 0-2.15 1.45-2.15 2.96v5.66H9.34V9h3.41v1.56h.05c.48-.9 1.65-1.86 3.4-1.86 3.63 0 4.3 2.39 4.3 5.5v6.25zM5.34 7.43a2.06 2.06 0 1 1 0-4.12 2.06 2.06 0 0 1 0 4.12zM7.12 20.45H3.56V9h3.56v11.45zM22.22 0H1.77C.79 0 0 .77 0 1.73v20.54C0 23.23.79 24 1.77 24h20.45c.99 0 1.78-.77 1.78-1.73V1.73C24 .77 23.21 0 22.22 0z" />
    </svg>
  );
}
import { format } from "date-fns";
import { relativeTime, displayName } from "@/lib/utils";
import { EditStudentDialog } from "./edit-student-dialog";
import { ManageTeamDialog } from "./manage-team-dialog";
import { CalendarShareButton } from "./calendar-share-button";
import { DriveShareButton } from "./drive-share-button";

const STATUS_COLOR: Record<string, string> = {
  active: "#00ca72",
  on_leave: "#ffcc4d",
  submitted: "#a855f7",
  graduated: "#2196f3",
  withdrawn: "#94a3b8",
};

const TICKET_STATUS_COLOR: Record<string, string> = {
  backlog: "#94a3b8",
  todo: "#2196f3",
  in_progress: "#ff7a45",
  review: "#a855f7",
  blocked: "#e2445c",
  done: "#00ca72",
};

export default async function StudentDetail({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const session = (await auth())!;
  const role = session.user.role as Role;
  const access = await accessForStudent(id, session.user.id, role);
  const canEdit = canEditStudentProfile(access);
  const canTeam = canManageTeam(access);
  const canDelete = canDeleteStudent(access);
  // Provisioning shared Google resources (calendar, drive folder) is now
  // student-only — they own their own Google account, the calendar/folder
  // lives there, and supervisors get writer access via ACL.
  const isSelfStudent = access === "self";

  const student = await prisma.student.findFirst({
    where: { id, ...studentVisibilityWhereAllForAdmin(session.user.id, role) },
    include: {
      supervisor: true,
      coSupervisors: { include: { user: true } },
      tickets: {
        where: { archivedAt: null },
        orderBy: { updatedAt: "desc" },
        take: 8,
        include: { assignee: true },
      },
      events: {
        where: { startsAt: { gte: new Date() } },
        orderBy: { startsAt: "asc" },
        take: 5,
      },
      channels: { include: { _count: { select: { messages: true } } } },
      favorites: {
        orderBy: { createdAt: "desc" },
        include: {
          starredBy: { select: { id: true, name: true, image: true, color: true } },
        },
      },
      thesisChapters: { orderBy: [{ order: "asc" }, { createdAt: "asc" }] },
      publications: { orderBy: [{ submittedAt: "desc" }, { createdAt: "desc" }] },
    },
  });
  if (!student) notFound();

  const teamLevel = await teamLevelForStudent(id, session.user.id, role);
  const canWriteThesis = teamLevel === "supervisor" || teamLevel === "self";

  // Private supervisor notes: only fetched/sent to supervisor-level viewers.
  // Non-supervisors (student, external advisors, committee) never receive
  // this data in props at all.
  const canSeePrivate = canSeeSupervisorPrivate(teamLevel);
  const supervisorNotes = canSeePrivate
    ? await prisma.supervisorNote.findMany({
        where: { studentId: id },
        orderBy: { createdAt: "desc" },
        include: {
          author: { select: { id: true, name: true, image: true, color: true } },
        },
      })
    : [];

  // Weekly check-ins: text visible to the team; wellbeing only to
  // supervisor-level (or the student themselves).
  const showWellbeing = canSeePrivate || teamLevel === "self";
  const checkins = await prisma.checkIn.findMany({
    where: { studentId: id },
    orderBy: { weekOf: "desc" },
    take: 12,
  });

  const driveUrl = student.driveFolderId
    ? `https://drive.google.com/drive/folders/${student.driveFolderId}`
    : null;

  return (
    <div className="p-6 lg:p-8 space-y-6">
      <div
        className="rounded-2xl bg-white border shadow-sm overflow-hidden"
      >
        <div className="h-24 brand-bg relative">
          <div className="absolute inset-0 dotgrid opacity-15" />
        </div>
        <div className="px-6 pb-6 -mt-12 relative">
          <div className="flex items-end gap-4 flex-wrap">
            <Avatar
              name={student.fullName}
              src={student.avatarUrl}
              color={student.color}
              size="lg"
              className="!h-20 !w-20 !text-xl ring-4 ring-white"
            />
            <div className="flex-1 min-w-0 pb-2">
              <div className="flex items-center gap-2 flex-wrap">
                <h1
                  className="text-2xl font-bold text-slate-900"
                  title={student.fullName}
                >
                  {displayName(student)}
                </h1>
                <Badge color={STATUS_COLOR[student.status]} variant="solid">
                  {student.status}
                </Badge>
              </div>
              <div className="text-sm text-slate-500 mt-1 flex items-center gap-3 flex-wrap">
                <a
                  href={`mailto:${student.email}`}
                  className="flex items-center gap-1 hover:text-slate-900"
                >
                  <Mail className="h-3.5 w-3.5" />
                  {student.email}
                </a>
                <span className="flex items-center gap-1">
                  <GraduationCap className="h-3.5 w-3.5" />
                  Year {student.programYear}
                </span>
                {student.expectedEndDate && (
                  <span>
                    expected {format(student.expectedEndDate, "MMM yyyy")}
                  </span>
                )}
                {student.linkedinUrl && (
                  <a
                    href={student.linkedinUrl}
                    target="_blank"
                    rel="noopener"
                    className="flex items-center gap-1 text-sky-700 hover:text-sky-900"
                    title={student.linkedinUrl}
                  >
                    <Linkedin className="h-3.5 w-3.5" />
                    LinkedIn
                  </a>
                )}
                {student.websiteUrl && (
                  <a
                    href={student.websiteUrl}
                    target="_blank"
                    rel="noopener"
                    className="flex items-center gap-1 text-violet-700 hover:text-violet-900"
                  >
                    <Globe className="h-3.5 w-3.5" />
                    Website
                  </a>
                )}
              </div>
            </div>
            <div className="flex gap-2 flex-wrap pb-2">
              {canEdit && (
                <EditStudentDialog
                  canDelete={canDelete}
                  canPickResources={isSelfStudent}
                  student={{
                    id: student.id,
                    fullName: student.fullName,
                    alias: student.alias,
                    email: student.email,
                    programYear: student.programYear,
                    status: student.status,
                    thesisTitle: student.thesisTitle,
                    researchArea: student.researchArea,
                    driveFolderId: student.driveFolderId,
                    calendarId: student.calendarId,
                    color: student.color,
                    expectedEndDate: student.expectedEndDate?.toISOString() ?? null,
                    avatarUrl: student.avatarUrl,
                    linkedinUrl: student.linkedinUrl,
                    orcidId: student.orcidId,
                    websiteUrl: student.websiteUrl,
                  }}
                />
              )}
              <Link href={`/kanban?student=${student.id}`}>
                <Button variant="brand" size="sm">
                  <KanbanSquare className="h-4 w-4" />
                  Tickets
                </Button>
              </Link>
              <Link href={`/calendar?student=${student.id}`}>
                <Button variant="outline" size="sm">
                  <CalendarDays className="h-4 w-4" />
                  Calendar
                </Button>
              </Link>
              <Link href={`/files?student=${student.id}`}>
                <Button variant="outline" size="sm">
                  <FolderOpen className="h-4 w-4" />
                  Drive
                </Button>
              </Link>
              <Link href={`/chat?student=${student.id}`}>
                <Button variant="outline" size="sm">
                  <MessagesSquare className="h-4 w-4" />
                  Chat
                </Button>
              </Link>
              <Link href={`/students/${student.id}/review`}>
                <Button variant="outline" size="sm">
                  <ScrollText className="h-4 w-4" />
                  Annual review
                </Button>
              </Link>
              {isSelfStudent && (
                <CalendarShareButton
                  studentId={student.id}
                  hasCalendar={!!student.calendarId}
                />
              )}
              {isSelfStudent && (
                <DriveShareButton
                  studentId={student.id}
                  hasFolder={!!student.driveFolderId}
                />
              )}
            </div>
          </div>

          {student.thesisTitle && (
            <div className="mt-5 rounded-xl bg-slate-50 p-4 border">
              <div className="text-xs font-semibold uppercase text-slate-500">
                Thesis
              </div>
              <div className="mt-1 text-slate-800 italic">
                &ldquo;{student.thesisTitle}&rdquo;
              </div>
              {student.researchArea && (
                <div className="mt-2 text-xs text-slate-500">
                  Area: {student.researchArea}
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
        <div className="xl:col-span-2 space-y-6">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle className="flex items-center gap-2">
                <Star className="h-4 w-4 text-amber-500" fill="currentColor" />
                Main documents
              </CardTitle>
              <Link
                href={`/files?student=${student.id}`}
                className="text-xs font-semibold text-[var(--c-blue)] hover:underline"
              >
                Browse Drive →
              </Link>
            </CardHeader>
            <CardContent className="p-0">
              {student.favorites.length === 0 ? (
                <div className="p-8 text-center text-sm text-slate-500">
                  <p>No main documents yet.</p>
                  <p className="text-xs text-slate-400 mt-1">
                    Open the Files tab, browse the Drive folder, and click the star icon
                    on any file to add it here.
                  </p>
                </div>
              ) : (
                <ul className="divide-y">
                  {student.favorites.map((f) => (
                    <li
                      key={f.id}
                      className="flex items-center gap-3 p-4 hover:bg-slate-50"
                    >
                      <span
                        className="flex h-9 w-9 items-center justify-center rounded-lg shrink-0"
                        style={{
                          background: `${favColor(f.mimeType)}1f`,
                          color: favColor(f.mimeType),
                        }}
                      >
                        <FavIcon mimeType={f.mimeType} />
                      </span>
                      <div className="flex-1 min-w-0">
                        <a
                          href={
                            f.webViewLink ??
                            (f.mimeType === "application/vnd.google-apps.folder"
                              ? `https://drive.google.com/drive/folders/${f.driveFileId}`
                              : "#")
                          }
                          target="_blank"
                          rel="noopener"
                          className="block text-sm font-medium text-slate-900 hover:text-[var(--c-blue)] truncate"
                        >
                          {f.name}
                        </a>
                        <div className="text-xs text-slate-500 mt-0.5">
                          {prettyFavMime(f.mimeType)} · starred {format(f.createdAt, "MMM d")}
                          {" "}by {f.starredBy.name?.split(" ")[0] ?? "someone"}
                        </div>
                      </div>
                      <ExternalLink className="h-3.5 w-3.5 text-slate-400 shrink-0" />
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>

          <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle>Recent tasks</CardTitle>
            <Link
              href={`/kanban?student=${student.id}`}
              className="text-xs font-semibold text-[var(--c-orange)] hover:underline"
            >
              See all →
            </Link>
          </CardHeader>
          <CardContent className="p-0">
            {student.tickets.length === 0 ? (
              <div className="p-8 text-center text-sm text-slate-500">
                No tickets yet for this student.
              </div>
            ) : (
              <ul className="divide-y">
                {student.tickets.map((t) => (
                  <li key={t.id}>
                    <Link
                      href={`/kanban?ticket=${t.id}`}
                      className="flex items-center gap-3 p-4 hover:bg-slate-50"
                    >
                      <span
                        className="h-2 w-2 rounded-full shrink-0"
                        style={{
                          background: TICKET_STATUS_COLOR[t.status],
                        }}
                      />
                      <div className="flex-1 min-w-0">
                        <div className="text-sm font-medium text-slate-900 truncate">
                          {t.title}
                        </div>
                        <div className="text-xs text-slate-500 mt-0.5">
                          {t.dueDate
                            ? `due ${format(t.dueDate, "MMM d")}`
                            : `updated ${relativeTime(t.updatedAt)}`}
                          {t.assignee && <> · {t.assignee.name}</>}
                        </div>
                      </div>
                      <Badge color={TICKET_STATUS_COLOR[t.status]}>
                        {t.status.replace("_", " ")}
                      </Badge>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>

        <ThesisPublications
          studentId={student.id}
          studentDriveFolderId={student.driveFolderId}
          canWrite={canWriteThesis}
          initialChapters={student.thesisChapters.map((c) => ({
            id: c.id,
            title: c.title,
            status: c.status,
            driveUrl: c.driveUrl,
            notes: c.notes,
          }))}
          initialPublications={student.publications.map((p) => ({
            id: p.id,
            title: p.title,
            venue: p.venue,
            type: p.type,
            status: p.status,
            authors: p.authors,
            url: p.url,
            driveUrl: p.driveUrl,
            submittedAt: p.submittedAt?.toISOString() ?? null,
            decisionAt: p.decisionAt?.toISOString() ?? null,
            notes: p.notes,
          }))}
        />

        {canSeePrivate && (
          <SupervisorNotes
            studentId={student.id}
            viewerId={session.user.id}
            isAdmin={role === "admin"}
            initialNotes={supervisorNotes.map((n) => ({
              id: n.id,
              body: n.body,
              createdAt: n.createdAt.toISOString(),
              author: n.author,
            }))}
          />
        )}

        <Card>
          <CardHeader>
            <CardTitle>Weekly check-ins</CardTitle>
          </CardHeader>
          <CardContent>
            {checkins.length === 0 ? (
              <p className="text-sm text-slate-400">
                No check-ins submitted yet.
              </p>
            ) : (
              <ul className="space-y-3">
                {checkins.map((c) => (
                  <li key={c.id} className="rounded-lg border bg-white p-3">
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-xs font-semibold text-slate-700">
                        Week of {format(c.weekOf, "MMM d, yyyy")}
                      </span>
                      {showWellbeing && c.wellbeing != null && (
                        <span className="text-[10px] text-slate-500">
                          wellbeing{" "}
                          <span
                            className="font-bold"
                            style={{
                              color:
                                c.wellbeing <= 2
                                  ? "var(--c-red)"
                                  : c.wellbeing === 3
                                    ? "#f59e0b"
                                    : "var(--c-green)",
                            }}
                          >
                            {c.wellbeing}/5
                          </span>
                        </span>
                      )}
                    </div>
                    {c.did && (
                      <p className="text-xs text-slate-600">
                        <span className="font-medium text-slate-500">Did: </span>
                        {c.did}
                      </p>
                    )}
                    {c.blockers && (
                      <p className="text-xs text-slate-600 mt-0.5">
                        <span className="font-medium text-slate-500">
                          Blockers:{" "}
                        </span>
                        {c.blockers}
                      </p>
                    )}
                    {c.next && (
                      <p className="text-xs text-slate-600 mt-0.5">
                        <span className="font-medium text-slate-500">
                          Next:{" "}
                        </span>
                        {c.next}
                      </p>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
        </div>

        <div className="space-y-6">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle>Supervision team</CardTitle>
              {canTeam && (
                <ManageTeamDialog
                  studentId={student.id}
                  studentName={displayName(student)}
                />
              )}
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="flex items-center gap-3">
                <Avatar
                  name={student.supervisor.name}
                  src={student.supervisor.image}
                  color={student.supervisor.color}
                />
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-medium text-slate-900">
                    {student.supervisor.name}
                  </div>
                  <div className="text-xs text-slate-500">Supervisor</div>
                </div>
              </div>
              {student.coSupervisors.map((cs) => (
                <div key={cs.id} className="flex items-center gap-3">
                  <Avatar
                    name={cs.user.name}
                    src={cs.user.image}
                    color={cs.user.color}
                  />
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium text-slate-900">
                      {cs.user.name}
                    </div>
                    <div className="text-xs text-slate-500">
                      {teamRoleLabel(cs.role)}
                    </div>
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Linked resources</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {driveUrl ? (
                <a
                  href={driveUrl}
                  target="_blank"
                  rel="noopener"
                  className="flex items-center gap-3 rounded-lg p-2 hover:bg-slate-50"
                >
                  <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-blue-100 text-blue-600">
                    <FolderOpen className="h-4 w-4" />
                  </span>
                  <span className="flex-1 text-sm font-medium text-slate-900">
                    Drive folder
                  </span>
                  <ExternalLink className="h-3.5 w-3.5 text-slate-400" />
                </a>
              ) : (
                <p className="text-xs text-slate-500">
                  {isSelfStudent
                    ? "No Drive folder linked. Edit the student to add one."
                    : "No Drive folder linked. The student has yet to create one."}
                </p>
              )}
              {student.calendarId ? (
                <a
                  href={`https://calendar.google.com/calendar/u/0/r?cid=${Buffer.from(student.calendarId).toString("base64").replace(/=+$/, "")}`}
                  target="_blank"
                  rel="noopener"
                  className="flex items-center gap-3 rounded-lg p-2 hover:bg-slate-50"
                >
                  <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-teal-100 text-teal-600">
                    <CalendarDays className="h-4 w-4" />
                  </span>
                  <span className="flex-1 text-sm font-medium text-slate-900">
                    Shared calendar
                  </span>
                  <ExternalLink className="h-3.5 w-3.5 text-slate-400" />
                </a>
              ) : (
                <p className="text-xs text-slate-500">
                  {isSelfStudent
                    ? "No shared calendar yet. PhDapp can create one in your Google account and grant the team writer access."
                    : "No shared calendar yet. The student has yet to create one."}
                </p>
              )}
              {isSelfStudent && (
                <div className="pt-1 flex flex-wrap gap-2">
                  <CalendarShareButton
                    studentId={student.id}
                    hasCalendar={!!student.calendarId}
                  />
                  <DriveShareButton
                    studentId={student.id}
                    hasFolder={!!student.driveFolderId}
                  />
                </div>
              )}
              {student.linkedinUrl && (
                <ResourceLink
                  href={student.linkedinUrl}
                  icon={<Linkedin className="h-4 w-4" />}
                  label="LinkedIn profile"
                  bg="bg-sky-100"
                  fg="text-sky-700"
                />
              )}
              {student.orcidId && (
                <ResourceLink
                  href={student.orcidId}
                  icon={<BookOpen className="h-4 w-4" />}
                  label="ORCID"
                  sub={student.orcidId.replace("https://orcid.org/", "")}
                  bg="bg-green-100"
                  fg="text-green-700"
                />
              )}
              {student.websiteUrl && (
                <ResourceLink
                  href={student.websiteUrl}
                  icon={<Globe className="h-4 w-4" />}
                  label="Personal website"
                  sub={student.websiteUrl.replace(/^https?:\/\//, "")}
                  bg="bg-violet-100"
                  fg="text-violet-700"
                />
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Upcoming meetings</CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              {student.events.length === 0 ? (
                <div className="p-4 text-xs text-slate-500">
                  Nothing scheduled.
                </div>
              ) : (
                <ul className="divide-y">
                  {student.events.map((e) => (
                    <li key={e.id} className="p-3">
                      <div className="text-sm font-medium text-slate-900">
                        {e.title}
                      </div>
                      <div className="text-xs text-slate-500 mt-0.5">
                        {format(e.startsAt, "EEE MMM d · HH:mm")}
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}

function ResourceLink({
  href,
  icon,
  label,
  sub,
  bg,
  fg,
}: {
  href: string;
  icon: React.ReactNode;
  label: string;
  sub?: string;
  bg: string;
  fg: string;
}) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener"
      className="flex items-center gap-3 rounded-lg p-2 hover:bg-slate-50"
    >
      <span className={`flex h-8 w-8 items-center justify-center rounded-lg ${bg} ${fg}`}>
        {icon}
      </span>
      <span className="flex-1 min-w-0">
        <span className="block text-sm font-medium text-slate-900">{label}</span>
        {sub && (
          <span className="block text-[10px] text-slate-500 truncate">{sub}</span>
        )}
      </span>
      <ExternalLink className="h-3.5 w-3.5 text-slate-400 shrink-0" />
    </a>
  );
}

function teamRoleLabel(role: string): string {
  return (
    {
      supervisor: "Supervisor",
      co_supervisor: "Supervisor", // legacy data
      external_advisor: "External advisor",
      committee: "Committee member",
    } as Record<string, string>
  )[role] ?? role.replace("_", " ");
}

function FavIcon({ mimeType }: { mimeType: string }) {
  if (mimeType === "application/vnd.google-apps.folder")
    return <FolderOpen className="h-4 w-4" />;
  if (mimeType.startsWith("image/")) return <ImageIcon className="h-4 w-4" />;
  if (mimeType.includes("spreadsheet") || mimeType.includes("excel"))
    return <FileSpreadsheet className="h-4 w-4" />;
  if (mimeType.includes("document") || mimeType.includes("pdf"))
    return <FileText className="h-4 w-4" />;
  return <FileIcon className="h-4 w-4" />;
}

function favColor(mimeType: string): string {
  if (mimeType === "application/vnd.google-apps.folder") return "#2196f3";
  if (mimeType.startsWith("image/")) return "#ec4899";
  if (mimeType.includes("spreadsheet") || mimeType.includes("excel")) return "#00ca72";
  if (mimeType.includes("document")) return "#6f4cff";
  if (mimeType.includes("pdf")) return "#e2445c";
  if (mimeType.includes("presentation")) return "#ff7a45";
  return "#64748b";
}

function prettyFavMime(mimeType: string): string {
  const map: Record<string, string> = {
    "application/vnd.google-apps.folder": "Folder",
    "application/vnd.google-apps.document": "Google Doc",
    "application/vnd.google-apps.spreadsheet": "Google Sheet",
    "application/vnd.google-apps.presentation": "Google Slides",
    "application/pdf": "PDF",
  };
  return map[mimeType] ?? mimeType.split("/").pop() ?? mimeType;
}
