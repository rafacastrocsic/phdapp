import { auth } from "@/auth";
import { redirect } from "next/navigation";
import Link from "next/link";
import { computeMetrics, recordSnapshot, getTrend } from "@/lib/metrics";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { LocalTime } from "@/components/local-time";
import { Sparkline } from "@/components/sparkline";
import {
  ArrowLeft,
  Users,
  Activity,
  KanbanSquare,
  MessagesSquare,
  BookOpen,
  CalendarCheck,
  ClipboardCheck,
  FolderOpen,
  Clock,
  Layers,
  TrendingUp,
} from "lucide-react";

export const dynamic = "force-dynamic";

// Admin-only adoption / usage dashboard. Server component — runs the
// aggregations on each load (force-dynamic, no caching) so the
// numbers are always current. Designed to be screenshot-friendly
// for reports.
export default async function MetricsPage() {
  const session = (await auth())!;
  if (session.user.role !== "admin") redirect("/");

  const m = await computeMetrics();
  // Capture today's snapshot on view (idempotent per UTC day) so the
  // trend lines start filling from first visit, not only once the
  // nightly cron has run. Fire-and-forget — never block the page.
  await recordSnapshot(m).catch(() => {});
  const trend = await getTrend(90).catch(() => []);
  const pct = (v: number | null) => (v === null ? "—" : `${v}%`);
  const num = (v: number | null) => (v === null ? "—" : `${v}`);

  return (
    <div className="p-6 lg:p-8 max-w-6xl mx-auto space-y-6">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <Link
            href="/admin"
            className="inline-flex items-center gap-1 text-xs text-slate-500 hover:text-slate-800"
          >
            <ArrowLeft className="h-3.5 w-3.5" /> Back to Admin
          </Link>
          <h1 className="text-2xl font-bold text-slate-900 mt-1">
            Usage & adoption
          </h1>
          <p className="text-sm text-slate-500 mt-1">
            Live figures from PhDapp data. As of{" "}
            <LocalTime iso={m.generatedAt} fmt="MMM d, yyyy · HH:mm" />.
            Reload to recompute.
          </p>
        </div>
      </div>

      {/* ── Headline KPI row ── */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Kpi
          icon={<Users className="h-4 w-4" />}
          color="var(--c-violet)"
          label="Monthly active"
          value={`${m.users.mau}`}
          sub={`${m.users.everSignedIn}/${m.users.total} ever signed in`}
        />
        <Kpi
          icon={<Activity className="h-4 w-4" />}
          color="var(--c-teal)"
          label="Weekly active"
          value={`${m.users.wau}`}
          sub={
            m.users.stickiness === null
              ? "—"
              : `${Math.round(m.users.stickiness * 100)}% stickiness (WAU/MAU)`
          }
        />
        <Kpi
          icon={<CalendarCheck className="h-4 w-4" />}
          color="var(--c-orange)"
          label="Meetings w/ notes"
          value={`${m.meetings.withNotesOrAgenda}`}
          sub={`${pct(m.meetings.pctWithNotes)} of ${m.meetings.total} meetings`}
        />
        <Kpi
          icon={<ClipboardCheck className="h-4 w-4" />}
          color="var(--c-green)"
          label="Check-in rate (4w)"
          value={pct(m.checkins.submissionRatePct)}
          sub={`${m.checkins.last4wReceived}/${m.checkins.last4wExpected} expected`}
        />
      </div>

      {/* ── Trends ── */}
      <Card>
        <CardHeader className="flex flex-row items-center gap-2">
          <TrendingUp className="h-4 w-4 text-[var(--c-violet)]" />
          <CardTitle>Trends</CardTitle>
        </CardHeader>
        <CardContent className="p-5">
          {trend.length < 2 ? (
            <p className="text-sm text-slate-500">
              Trend lines appear once a few daily snapshots accumulate. A
              snapshot is captured automatically every night (and once each
              time you open this page), so check back over the coming days —
              {trend.length === 0
                ? " none recorded yet."
                : " 1 recorded so far."}
            </p>
          ) : (
            <>
              <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-x-6 gap-y-5">
                <TrendCell
                  label="Monthly active users"
                  values={trend.map((t) => t.mau)}
                  latest={trend[trend.length - 1]!.mau}
                  color="var(--c-violet)"
                />
                <TrendCell
                  label="Weekly active users"
                  values={trend.map((t) => t.wau)}
                  latest={trend[trend.length - 1]!.wau}
                  color="var(--c-teal)"
                />
                <TrendCell
                  label="Tasks completed (30d window)"
                  values={trend.map((t) => t.tasksCompleted30)}
                  latest={trend[trend.length - 1]!.tasksCompleted30}
                  color="var(--c-orange)"
                />
                <TrendCell
                  label="Chat messages (7d window)"
                  values={trend.map((t) => t.messages7)}
                  latest={trend[trend.length - 1]!.messages7}
                  color="var(--c-green)"
                />
                <TrendCell
                  label="Check-in rate"
                  values={trend.map((t) => t.checkinRatePct)}
                  latest={trend[trend.length - 1]!.checkinRatePct}
                  suffix="%"
                  color="var(--c-blue)"
                />
                <TrendCell
                  label="Meetings with notes (cumulative)"
                  values={trend.map((t) => t.meetingsWithNotes)}
                  latest={trend[trend.length - 1]!.meetingsWithNotes}
                  color="var(--c-pink)"
                />
              </div>
              <p className="text-[11px] text-slate-400 pt-4">
                Last {trend.length} daily snapshot{trend.length === 1 ? "" : "s"}{" "}
                (up to 90 days). Each point is one day; the dot marks the latest.
              </p>
            </>
          )}
        </CardContent>
      </Card>

      {/* ── Adoption by role ── */}
      <Card>
        <CardHeader className="flex flex-row items-center gap-2">
          <Users className="h-4 w-4 text-[var(--c-violet)]" />
          <CardTitle>Adoption by role</CardTitle>
        </CardHeader>
        <CardContent className="p-5 space-y-3">
          {m.byRole.map((r) => {
            const signedPct =
              r.total > 0 ? Math.round((r.signedIn / r.total) * 100) : 0;
            const activePct =
              r.total > 0 ? Math.round((r.active30 / r.total) * 100) : 0;
            return (
              <div key={r.role}>
                <div className="flex items-center justify-between text-sm mb-1">
                  <span className="font-medium text-slate-800 capitalize">
                    {r.role}
                  </span>
                  <span className="text-slate-500">
                    {r.active30}/{r.total} active in 30d · {r.signedIn} signed in
                  </span>
                </div>
                <div className="relative h-2.5 rounded-full bg-slate-100 overflow-hidden">
                  {/* signed-in (faded) behind, active-30d (solid) in front */}
                  <div
                    className="absolute inset-y-0 left-0 bg-slate-300"
                    style={{ width: `${signedPct}%` }}
                  />
                  <div
                    className="absolute inset-y-0 left-0 bg-[var(--c-violet)]"
                    style={{ width: `${activePct}%` }}
                  />
                </div>
              </div>
            );
          })}
          <p className="text-[11px] text-slate-400 pt-1">
            Solid bar = active in the last 30 days. Faded bar = ever signed in.
          </p>
        </CardContent>
      </Card>

      {/* ── Module engagement ── */}
      <Card>
        <CardHeader className="flex flex-row items-center gap-2">
          <Layers className="h-4 w-4 text-[var(--c-teal)]" />
          <CardTitle>Module engagement (last 30 days)</CardTitle>
        </CardHeader>
        <CardContent className="p-5">
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
            {m.modules.map((mod) => (
              <div
                key={mod.key}
                className="rounded-xl border bg-slate-50 p-3 text-center"
              >
                <div className="text-2xl font-bold text-slate-900">
                  {mod.users}
                </div>
                <div className="text-xs text-slate-500 mt-0.5">{mod.label}</div>
              </div>
            ))}
          </div>
          <p className="text-[11px] text-slate-400 pt-3">
            Distinct people who created/authored something in each module in the
            last 30 days.
          </p>
        </CardContent>
      </Card>

      {/* ── Two-column detail grid ── */}
      <div className="grid md:grid-cols-2 gap-4">
        <DetailCard
          icon={<KanbanSquare className="h-4 w-4 text-[var(--c-orange)]" />}
          title="Tasks"
          rows={[
            ["Live tasks", num(m.tasks.totalLive)],
            ["Created (30d)", num(m.tasks.created30)],
            ["Completed (30d)", num(m.tasks.completed30)],
            ["Completion rate", pct(m.tasks.completionRatePct)],
            [
              "Median time to complete",
              m.tasks.medianDaysToComplete === null
                ? "—"
                : `${m.tasks.medianDaysToComplete} days`,
            ],
          ]}
        />
        <DetailCard
          icon={<MessagesSquare className="h-4 w-4 text-[var(--c-green)]" />}
          title="Chat"
          rows={[
            ["Messages (30d)", num(m.chat.messages30)],
            ["Messages (7d)", num(m.chat.messages7)],
            [
              "Active channels (30d)",
              `${m.chat.activeChannels30} / ${m.chat.totalChannels}`,
            ],
            ["Students messaging (30d)", pct(m.chat.studentsMessagingPct)],
          ]}
        />
        <DetailCard
          icon={<BookOpen className="h-4 w-4 text-[var(--c-violet)]" />}
          title="Reading list"
          rows={[
            ["Total items", num(m.reading.total)],
            ["Proposed by students", num(m.reading.proposedByStudents)],
            ["Added by supervisors", num(m.reading.addedBySupervisors)],
            [
              "Median approval time",
              m.reading.medianApprovalHours === null
                ? "—"
                : `${m.reading.medianApprovalHours} h`,
            ],
          ]}
        />
        <DetailCard
          icon={<FolderOpen className="h-4 w-4 text-[var(--c-blue)]" />}
          title="Resources consolidated"
          rows={[
            [
              "Students with Drive folder",
              `${m.resources.studentsWithDrive} / ${m.resources.totalStudents}`,
            ],
            ["Thesis chapters tracked", num(m.resources.thesisChapters)],
            ["Publications tracked", num(m.resources.publications)],
            ["Starred files", num(m.resources.starredFiles)],
          ]}
        />
      </div>

      {/* ── Wellbeing + engagement recency ── */}
      <div className="grid md:grid-cols-2 gap-4">
        <Card>
          <CardHeader className="flex flex-row items-center gap-2">
            <ClipboardCheck className="h-4 w-4 text-[var(--c-green)]" />
            <CardTitle>Weekly check-ins</CardTitle>
          </CardHeader>
          <CardContent className="p-5 space-y-1.5 text-sm">
            <Row label="Active students" value={num(m.checkins.activeStudents)} />
            <Row
              label="Received (last 4 weeks)"
              value={num(m.checkins.last4wReceived)}
            />
            <Row
              label="Submission rate"
              value={pct(m.checkins.submissionRatePct)}
            />
            <Row
              label="Average wellbeing (1–5)"
              value={
                m.checkins.avgWellbeing === null
                  ? "—"
                  : `${m.checkins.avgWellbeing}`
              }
            />
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center gap-2">
            <Clock className="h-4 w-4 text-[var(--c-pink)]" />
            <CardTitle>Engagement recency</CardTitle>
          </CardHeader>
          <CardContent className="p-5 space-y-1.5 text-sm">
            <Row label="Active today" value={`${m.recency.today}`} />
            <Row label="Active this week" value={`${m.recency.thisWeek}`} />
            <Row label="Active this month" value={`${m.recency.thisMonth}`} />
            <Row label="Inactive >30 days" value={`${m.recency.older}`} />
            <Row
              label="Never signed in"
              value={`${m.recency.neverSignedIn}`}
            />
          </CardContent>
        </Card>
      </div>

      <p className="text-[11px] text-slate-400">
        All figures are computed live from PhDapp&apos;s database — there is no
        external analytics. &ldquo;Active&rdquo; is based on authenticated page
        activity (recorded at most once every few minutes per user).
      </p>
    </div>
  );
}

function Kpi({
  icon,
  color,
  label,
  value,
  sub,
}: {
  icon: React.ReactNode;
  color: string;
  label: string;
  value: string;
  sub: string;
}) {
  return (
    <Card className="p-4">
      <div
        className="inline-flex h-8 w-8 items-center justify-center rounded-lg mb-2"
        style={{ background: `${color}1f`, color }}
      >
        {icon}
      </div>
      <div className="text-2xl font-bold text-slate-900 leading-none">
        {value}
      </div>
      <div className="text-xs font-medium text-slate-700 mt-1">{label}</div>
      <div className="text-[11px] text-slate-400 mt-0.5">{sub}</div>
    </Card>
  );
}

function TrendCell({
  label,
  values,
  latest,
  color,
  suffix = "",
}: {
  label: string;
  values: (number | null)[];
  latest: number | null;
  color: string;
  suffix?: string;
}) {
  // First non-null value, for the "+N since start" delta.
  const first = values.find((v) => v !== null) ?? null;
  const delta =
    first !== null && latest !== null ? latest - first : null;
  const deltaStr =
    delta === null
      ? null
      : delta === 0
        ? "no change"
        : `${delta > 0 ? "+" : ""}${delta}${suffix} since start`;
  return (
    <div>
      <div className="flex items-baseline justify-between gap-2">
        <span className="text-xs font-medium text-slate-700">{label}</span>
        <span className="text-lg font-bold text-slate-900 tabular-nums">
          {latest === null ? "—" : `${latest}${suffix}`}
        </span>
      </div>
      <Sparkline values={values} color={color} width={260} height={40} />
      {deltaStr && (
        <div
          className="text-[11px] mt-0.5"
          style={{ color: delta && delta > 0 ? "var(--c-green)" : "#94a3b8" }}
        >
          {deltaStr}
        </div>
      )}
    </div>
  );
}

function DetailCard({
  icon,
  title,
  rows,
}: {
  icon: React.ReactNode;
  title: string;
  rows: [string, string][];
}) {
  return (
    <Card>
      <CardHeader className="flex flex-row items-center gap-2">
        {icon}
        <CardTitle>{title}</CardTitle>
      </CardHeader>
      <CardContent className="p-5 space-y-1.5 text-sm">
        {rows.map(([label, value]) => (
          <Row key={label} label={label} value={value} />
        ))}
      </CardContent>
    </Card>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <span className="text-slate-600">{label}</span>
      <span className="font-semibold text-slate-900 tabular-nums">{value}</span>
    </div>
  );
}
