# PhDapp — improvement plan

Concrete implementation plan for the next wave of features. Each item lists: what it is, data-model changes, API surface, UI surface, permission rules, scope/risk, and dependencies. AI integration is explicitly **out of scope** for this wave (see `IMPROVEMENTS.md` → FUTURE).

Stack reminders that shape every item:
- Next.js (App Router) + Prisma + Postgres (Neon, Frankfurt) + Vercel (fra1) + Vercel Blob + Google APIs.
- Schema changes are additive and applied automatically on deploy via `prisma migrate deploy` in the build script. Always commit the migration file.
- Permission layer is `src/lib/access.ts`. **Gotcha**: `accessForStudent()` returns `"supervisor"` for *any* co-supervisor — it does **not** distinguish `CoSupervisor.role` (supervisor / co_supervisor / external_advisor / committee). `isSupervisingUser(userId, role)` already exists and is true for admin or a supervisor with ≥1 supervised student (excludes advisor/committee-only users) — reuse it for group-level gates.

---

## 0. Shared prerequisite — role-aware per-student access helper

Needed by §3 and §7: "is this viewer a supervisor-level member of this student's team (admin / primary / co-sup role supervisor|co_supervisor) — NOT external_advisor, committee, or the student?"

Add to `src/lib/access.ts`:

```ts
export type TeamLevel = "supervisor" | "advisor" | "committee" | "self" | null;
export async function teamLevelForStudent(studentId, userId, role): Promise<TeamLevel>;
//  admin / Student.supervisorId / CoSupervisor.role∈{supervisor,co_supervisor} -> "supervisor"
//  CoSupervisor.role==="external_advisor" -> "advisor"
//  CoSupervisor.role==="committee"        -> "committee"
//  Student.userId===userId                 -> "self"
//  else                                    -> null
export function canSeeSupervisorPrivate(t: TeamLevel) { return t === "supervisor"; }
```

Pure addition, no migration, low risk. **Build first.**

---

## 1. Thesis & publication tracker

**What:** structured tracking of thesis chapters and publications per student — the PhD-native backbone the app lacks.

**Data model (new):** `ThesisChapter` (studentId, title, status `planned|drafting|in_review|revising|done`, order, driveUrl?, notes?, timestamps) and `Publication` (studentId, title, venue?, type `journal|conference|preprint|other`, status `in_prep|submitted|under_review|major_rev|minor_rev|accepted|published|rejected`, authors?, url?, submittedAt?, decisionAt?, notes?, timestamps). Back-relations on `Student`.

**API:** `/api/students/[id]/thesis` and `/api/students/[id]/publications` — CRUD. Authorize with `accessForStudent` + write gated to `teamLevelForStudent ∈ {supervisor, self}` (advisor/committee read-only).

**UI:** new collapsible section on the student profile (`src/app/(app)/students/[id]/page.tsx`): chapters list (status pill, reorder) + publications table.

**Scope/risk:** medium. 2 models + migration, 2 routes, 1 profile section. Low risk. **No deps.**

---

## 2. Reading list (with approval flow)

**What:** per-student reading list. Supervisor adds (auto-approved) or student proposes → a supervisor must approve ("OK, go ahead").

**Data model (new):** `ReadingItem` (studentId, title, authors?, url?, addedById, proposedByStudent bool, status `proposed|approved|reading|done|rejected`, decisionById?, decisionNote?, timestamps).

**API:** `/api/students/[id]/reading` GET/POST; `/reading/[itemId]` PATCH/DELETE. Student POST forced `proposed`; supervisor POST `approved`; approve/reject PATCH only `teamLevelForStudent==="supervisor"`.

**UI:** profile section. Student: list + "Propose a reading" + status badges. Supervisor: approve/reject on proposed items; optional pending-proposal count on the student card/dashboard.

**Scope/risk:** small-medium. 1 model + migration. Low risk. **No deps.**

---

## 3. Private supervisor notes per student

**What:** internal notes thread per student — visible to supervisor-level team only; hidden from the student, external advisors, committee.

**Data model (new):** `SupervisorNote` (studentId, authorId, body, timestamps).

**API:** `/api/students/[id]/notes` CRUD. **Server-side** authorization with `canSeeSupervisorPrivate(teamLevelForStudent(...))`. Return **404** (not 403) to non-supervisors so the feature's existence isn't leaked.

**UI:** "Private notes (supervisors only)" panel on the student profile, rendered only for supervisor-level viewers, with a clear "not visible to student / advisors / committee" banner.

**Scope/risk:** small but **high care** on the permission boundary (also exclude from activity log / notifications surfaced to students). Depends on **§0**.

---

## 4. Workload view

**What:** supervisor/admin overview: per supervisor, active-student count and task load — to spot imbalance/overload.

**Data model:** none — aggregation over `User`/`Student`/`CoSupervisor`/`Ticket`.

**UI:** new "Workload" table/tab in `src/app/(app)/team/page.tsx`. Per supervisor: # active students (reuse the dedup logic already in the Team page), # open tasks, # overdue, # tasks assigned to them. Sortable. Team page already excludes students.

**Scope/risk:** small, read-only, no migration. Low risk. **No deps** (richer once §1 milestones exist).

---

## 5. Recurring calendar events

**What:** events that repeat (daily/weekly/monthly) with an interval and an end (until-date or count). Foundational calendar capability that §8 (meetings) and §9 (availability) can build on.

**Data model:** add to `Event` an `recurrenceRule String?` storing an iCal **RRULE** (e.g. `FREQ=WEEKLY;INTERVAL=1;UNTIL=20261231`). RRULE is the standard and Google Calendar API accepts `recurrence: ['RRULE:...']` directly — so syncing recurrence to Google is essentially free. Also `recurrenceParentId String?` for future per-instance exceptions (not implemented in MVP).

**API:** extend event create/patch to accept a structured recurrence (freq, interval, until|count) → serialize to RRULE; pass through to Google when pushing. In-app: expand occurrences for the visible range when rendering the grid (don't store every instance).

**UI:** recurrence picker in the new/edit event dialog (Does not repeat / Daily / Weekly / Monthly + interval + ends on/after). Recurring instances badged in the grid.

**MVP boundary:** simple recurrence only — **no** per-instance edits/exceptions, **no** "this and following". Editing a series edits all future occurrences. Document this limitation in the UI.

**Scope/risk:** medium-high — recurrence is a classic complexity sink; the MVP boundary keeps it contained. Additive migration. **No deps**; do before §8/§9 so they can be recurring.

---

## 6. Weekly async check-in

**What:** 2-minute weekly student update: did / blockers / next / wellbeing 1–5. Async; wellbeing trend is an early-warning signal.

**Data model (new):** `CheckIn` (studentId, weekOf DateTime, did?, blockers?, next?, wellbeing Int?, timestamps, `@@unique([studentId, weekOf])`).

**API:** `/api/students/[id]/checkins` GET/POST (upsert current week). Student writes own; team reads.

**UI:** student dashboard card "Your weekly check-in is due" → form. Supervisor view on the student profile: history + wellbeing sparkline; optionally surface low wellbeing on the Workload view.

**Permissions:** student writes own; the `did/blockers/next` text is readable by the whole team, but the **wellbeing score is supervisor-level only** (`canSeeSupervisorPrivate`) — hidden from external advisors, committee, and the student's other non-supervisor viewers. Enforce server-side (omit the field from API responses for non-supervisors).

**Scope/risk:** small-medium. 1 model + migration. Low risk. Feeds §10 and §11. Depends on **§0** for the wellbeing gate.

---

## 7. Supervisor team workspace (group-level)

**What:** a group-level space for the supervisory team — a **shared Drive folder** + **group notes** (not tied to a specific student): templates, group policy, inter-supervisor minutes. Hidden from students, external advisors, committee.

**Data model (new):** `TeamNote` (authorId, body, timestamps) — group-scoped, not student-scoped. Plus an admin-set setting for the shared Drive folder URL (a single app-level config row, e.g. a `Setting` key/value model, or an env-less DB setting `teamDriveFolderUrl`).

**API:** `/api/team/notes` CRUD and `/api/team/workspace` for the folder URL. Authorize with `isSupervisingUser(userId, role)` (admin or real supervisor) — **not** advisor/committee, **not** students. 404 to others.

**UI:** new "Team workspace" area for supervisors (a tab in the Team module, or a sidebar entry shown only to supervisor-level users): the shared-folder link + a group notes thread.

**Scope/risk:** medium. 1–2 small models + migration. Low-medium risk; permission gate is the careful part (reuse `isSupervisingUser`). **No deps.**

---

## 8. Structured 1:1 meetings

**What:** turn a meeting from a bare calendar event into a workflow: agenda (before) → notes (during) → action items (after) that convert into Tasks.

**Data model:** extend `Event`: `isMeeting Boolean @default(false)`, `agenda String?` (JSON `{id,text,addedById}[]`), `meetingNotes String?`. Action items become real `Ticket` rows on convert.

**API:** extend `/api/calendar/events/[id]` PATCH for `agenda`/`meetingNotes`; new `/api/calendar/events/[id]/action-items` POST → creates Tickets (studentId from event, per-item assignee + due date) and logs `ticket.create`.

**UI:** in the event dialog, when `isMeeting`: Agenda (team + student add bullets pre-meeting), Notes, Action items (assignee + due date + "Create tasks"). New-event dialog gets an "Is a 1:1 meeting" toggle. Can be recurring if §5 is done.

**Scope/risk:** medium-high — touches Calendar **and** Tasks. Additive migration. Most valuable after §1; best after §5 so meetings can recur.

---

## 9. Supervisor free/busy availability (travel / leave / holidays)

**What:** *not* a weekly chore. Occasionally a supervisor marks a period they're **away/unavailable** (conference travel, medical leave, holidays) so their students know not to expect them / when they're back. Students see a human-labelled away block, not the supervisor's full calendar.

**Data model (new):** `Availability` (userId = supervisor, startsAt, endsAt, `label` for the supervisor's own reference e.g. "Conference travel", kind `away|busy`, optional `recurrenceRule` reusing §5, timestamps). Dedicated model so it never pollutes student task/event data and can be styled distinctly.

**API:** `/api/availability` CRUD for the signed-in supervisor; read endpoint returns availability of a given student's supervisors. Students may read their own supervisors' availability; supervisors write only their own. **The read endpoint must NOT return `label` to students** — students only ever see an opaque "Unavailable" block (decided). The label is for the supervisor's own management view only.

**UI:** supervisor adds entries from their calendar view ("I'm away…", with a label they pick for themselves). On a student's calendar, a distinct "Supervisors' availability" overlay/panel showing each supervisor's periods as **"Unavailable"** only — no label, no reason.

**Scope/risk:** medium. 1 model + migration; calendar UI on both sides. Reuses §5 recurrence if present. **Soft dep on §5** (recurring absences) but works standalone for one-off periods.

---

## 10. Annual review export

**What:** one-click formal progress packet per student for a date range.

**Composes:** §1 chapters/pubs, tasks (completed/overdue in range), §8 meetings, §6 check-ins (text only — **never** the wellbeing score), calendar events, activity log. **Never includes §3 private supervisor notes** (no toggle — hard exclusion).

**Implementation:** MVP = print-styled HTML page `/students/[id]/review?from=&to=` (server component + `@media print`); user does Cmd+P → Save as PDF. Avoids a server PDF pipeline/new dependency. True server PDF later if needed.

**Permissions:** supervisors + admin can generate it. **External advisors and committee may view it read-only** (decided). Students: per existing pattern, view their own. Private notes and wellbeing scores are excluded from the rendered packet regardless of viewer.

**Scope/risk:** medium, no migration. **Depends on §1; richer with §6/§8.**

---

## 11. Email digest

**What:** scheduled email (e.g. Mon 08:00) per supervisor: students with overdue tasks, pending reading approvals, new check-ins (esp. low wellbeing), milestones hit, comments awaiting reply.

**Shared infra (also powers §12):** email provider **Resend** (new dep `resend`, env `RESEND_API_KEY`, `DIGEST_CRON_SECRET`). Vercel Cron (reuse the chat-cleanup cron pattern) → `/api/cron/weekly-digest` with `Bearer ${DIGEST_CRON_SECRET}` header check. Iterates supervisors, composes per-supervisor summary, sends via Resend. Per-user opt-out: `User.emailDigest Boolean @default(true)` (small migration).

**Scope/risk:** medium. New external dep + secret + cron. Basic digest can ship before §1/§6/§8 and get richer as they land — so **do near-last**.

---

## 12. Real notifications

**What:** event-triggered, immediate alerts (vs. §11's scheduled summary): a task assigned to you was created, a task you own is due tomorrow, an @mention, a meeting in 1 hour, a reading-list decision, a new check-in for your student.

**Implementation (this wave = email + in-app, decided):** two delivery channels off the same event hooks (the API routes that already `logActivity`):

- **Email**: reuse the §11 Resend infra — fire-and-forget transactional email on key events.
- **In-app notification center**: new `Notification` model (`userId`, `type`, `message`, `link`, `readAt?`, `createdAt`); a 🔔 bell in the topbar with an unread count and a dropdown list; endpoints to list and mark-read (single + all). The bell polls like the existing sidebar badges, or reuses that polling cycle.

Per-user, per-type preferences (extend the Settings page; a `NotificationPref` model or JSON on `User`) covering both channels.

**Deferred to a later wave:** browser/web push (service worker + VAPID) — separate infra, not needed for in-app + email.

**Scope/risk:** medium-high (two channels + bell UI + read-state). **Depends on §11 infra.** Do **last**.

---

## Recommended sequence

1. **§0** access helper — tiny, unblocks §3/§7/§10.
2. **§1** Thesis & publication tracker — foundational.
3. **§3** Private supervisor notes — small, high value, exercises §0.
4. **§4** Workload view — read-only, fast win.
5. **§2** Reading list — small, self-contained.
6. **§6** Weekly check-in — small, feeds §10/§11.
7. **§5** Recurring events — calendar core; precedes §8/§9.
8. **§9** Supervisor availability — depends softly on §5.
9. **§7** Supervisor team workspace — independent, medium.
10. **§8** Structured 1:1 meetings — cross-module; after §1/§5.
11. **§10** Annual review export — composes §1/§6/§8.
12. **§11** Email digest — introduces email/cron infra.
13. **§12** Real notifications — reuses §11 infra; last.

Each ships as its own commit + deploy, verified before moving on.

## Non-goals for this wave

- **AI integration** — deferred (no shared team key). See `IMPROVEMENTS.md` FUTURE.
- **Browser/web push** — email is the stepping stone (§11/§12); push is a later wave.
- **Mobile** — tracked in `docs/MOBILE_SUPPORT_PLAN.md`.
- **Calendar/Files ownership rework** — dropped; students always own/share their dedicated folder & calendar.
- **Per-instance recurring-event exceptions / "this and following"** — explicitly out of the §5 MVP (accepted).
- **Browser / web push** (service worker + VAPID) — deferred; §12 ships email + in-app only this wave.

## Decisions (confirmed)

- **§5**: recurring-events MVP boundary accepted — no per-instance exceptions; editing a series edits all future occurrences.
- **§6**: wellbeing score is **supervisor-level only**; the did/blockers/next text is team-readable.
- **§9**: students see only an opaque **"Unavailable"** block — never the supervisor's label/reason.
- **§10**: review packet **never** includes private supervisor notes or wellbeing scores (no toggle). External advisors and committee **may view the packet read-only**.
- **§12**: ships **email + in-app notification center** (🔔 bell, unread count, mark-read) this wave; only browser/web push is deferred.
