import { notFound } from "next/navigation";
import Link from "next/link";
import { format, subMonths } from "date-fns";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { teamLevelForStudent, type Role } from "@/lib/access";
import { displayName } from "@/lib/utils";
import { PrintButton } from "./print-button";

// Annual review packet. NEVER includes private supervisor notes or the
// wellbeing score (decision §10). Advisors/committee may view read-only.
export default async function ReviewPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ from?: string; to?: string }>;
}) {
  const { id } = await params;
  const sp = await searchParams;
  const session = (await auth())!;
  const role = session.user.role as Role;
  const level = await teamLevelForStudent(id, session.user.id, role);
  if (level === null) notFound();

  const to = sp.to ? new Date(sp.to) : new Date();
  const from = sp.from ? new Date(sp.from) : subMonths(to, 12);

  const student = await prisma.student.findUnique({
    where: { id },
    include: {
      supervisor: { select: { name: true, email: true } },
      thesisChapters: { orderBy: { order: "asc" } },
      publications: { orderBy: { createdAt: "desc" } },
    },
  });
  if (!student) notFound();

  const [completed, overdue, meetings, checkins] = await Promise.all([
    prisma.ticket.findMany({
      where: {
        studentId: id,
        status: "done",
        completedAt: { gte: from, lte: to },
      },
      orderBy: { completedAt: "desc" },
      select: { title: true, completedAt: true },
    }),
    prisma.ticket.findMany({
      where: {
        studentId: id,
        status: { notIn: ["done"] },
        dueDate: { lt: new Date() },
      },
      select: { title: true, dueDate: true },
    }),
    prisma.event.findMany({
      where: {
        studentId: id,
        isMeeting: true,
        startsAt: { gte: from, lte: to },
      },
      orderBy: { startsAt: "asc" },
      select: { title: true, startsAt: true, meetingNotes: true },
    }),
    prisma.checkIn.findMany({
      where: { studentId: id, weekOf: { gte: from, lte: to } },
      orderBy: { weekOf: "asc" },
      select: { weekOf: true, did: true, blockers: true, next: true },
    }),
  ]);

  return (
    <div className="mx-auto max-w-3xl p-6 lg:p-10 print:p-0">
      <div className="flex items-center justify-between mb-6 print:hidden">
        <Link
          href={`/students/${id}`}
          className="text-sm text-slate-500 hover:underline"
        >
          ← Back to profile
        </Link>
        <PrintButton />
      </div>

      <header className="border-b pb-4 mb-6">
        <h1 className="text-2xl font-bold text-slate-900">
          Annual progress review
        </h1>
        <p className="text-slate-700 mt-1">
          {displayName(student)} · Year {student.programYear} ·{" "}
          {student.status.replace("_", " ")}
        </p>
        <p className="text-sm text-slate-500">
          Period {format(from, "d MMM yyyy")} – {format(to, "d MMM yyyy")} ·
          Supervisor: {student.supervisor?.name ?? "—"}
        </p>
        {student.thesisTitle && (
          <p className="text-sm text-slate-600 mt-1 italic">
            Thesis: {student.thesisTitle}
          </p>
        )}
      </header>

      <Section title="Thesis chapters">
        {student.thesisChapters.length === 0 ? (
          <Empty />
        ) : (
          <ul className="space-y-1">
            {student.thesisChapters.map((c) => (
              <li key={c.id} className="text-sm flex justify-between">
                <span>{c.title}</span>
                <span className="text-slate-500">
                  {c.status.replace("_", " ")}
                </span>
              </li>
            ))}
          </ul>
        )}
      </Section>

      <Section title="Publications">
        {student.publications.length === 0 ? (
          <Empty />
        ) : (
          <ul className="space-y-1">
            {student.publications.map((p) => (
              <li key={p.id} className="text-sm">
                <span className="font-medium">{p.title}</span>
                {p.venue ? ` — ${p.venue}` : ""}{" "}
                <span className="text-slate-500">
                  ({p.type}, {p.status.replace("_", " ")})
                </span>
              </li>
            ))}
          </ul>
        )}
      </Section>

      <Section title={`Tasks completed (${completed.length})`}>
        {completed.length === 0 ? (
          <Empty />
        ) : (
          <ul className="space-y-1">
            {completed.map((t, i) => (
              <li key={i} className="text-sm flex justify-between">
                <span>{t.title}</span>
                <span className="text-slate-500">
                  {t.completedAt ? format(t.completedAt, "d MMM yyyy") : ""}
                </span>
              </li>
            ))}
          </ul>
        )}
      </Section>

      {overdue.length > 0 && (
        <Section title={`Currently overdue (${overdue.length})`}>
          <ul className="space-y-1">
            {overdue.map((t, i) => (
              <li key={i} className="text-sm">
                {t.title}
                {t.dueDate ? (
                  <span className="text-slate-500">
                    {" "}
                    — due {format(t.dueDate, "d MMM yyyy")}
                  </span>
                ) : null}
              </li>
            ))}
          </ul>
        </Section>
      )}

      <Section title={`Supervision meetings (${meetings.length})`}>
        {meetings.length === 0 ? (
          <Empty />
        ) : (
          <ul className="space-y-2">
            {meetings.map((m, i) => (
              <li key={i} className="text-sm">
                <span className="font-medium">
                  {format(m.startsAt, "d MMM yyyy")}
                </span>{" "}
                — {m.title}
                {m.meetingNotes && (
                  <p className="text-slate-600 whitespace-pre-wrap mt-0.5">
                    {m.meetingNotes}
                  </p>
                )}
              </li>
            ))}
          </ul>
        )}
      </Section>

      <Section title="Weekly check-in summary">
        {checkins.length === 0 ? (
          <Empty />
        ) : (
          <ul className="space-y-2">
            {checkins.map((c, i) => (
              <li key={i} className="text-sm">
                <span className="font-medium">
                  Week of {format(c.weekOf, "d MMM yyyy")}
                </span>
                {c.did && <div>Did: {c.did}</div>}
                {c.blockers && <div>Blockers: {c.blockers}</div>}
                {c.next && <div>Next: {c.next}</div>}
              </li>
            ))}
          </ul>
        )}
        <p className="text-[10px] text-slate-400 mt-2">
          Wellbeing scores and private supervisor notes are intentionally
          excluded from this report.
        </p>
      </Section>
    </div>
  );
}

function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="mb-6 break-inside-avoid">
      <h2 className="text-sm font-bold uppercase tracking-wide text-slate-700 border-b border-slate-200 pb-1 mb-2">
        {title}
      </h2>
      {children}
    </section>
  );
}
function Empty() {
  return <p className="text-sm text-slate-400">None recorded.</p>;
}
