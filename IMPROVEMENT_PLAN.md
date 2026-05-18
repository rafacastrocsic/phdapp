# PhDapp — improvement plan

Concrete implementation plan for the next wave of features. Each item lists: what it is, data-model changes, API surface, UI surface, permission rules, scope/risk, and dependencies. AI integration is explicitly **out of scope** for this wave (see the [FUTURE](#future-deferred-beyond-this-wave) section at the bottom).

Stack reminders that shape every item:
- Next.js (App Router) + Prisma + Postgres (Neon, Frankfurt) + Vercel (fra1) + Vercel Blob + Google APIs.
- Schema changes are additive and applied automatically on deploy via `prisma migrate deploy` in the build script. Always commit the migration file.
- Permission layer is `src/lib/access.ts`. **Gotcha**: `accessForStudent()` returns `"supervisor"` for *any* co-supervisor — it does **not** distinguish `CoSupervisor.role` (supervisor / co_supervisor / external_advisor / committee). `isSupervisingUser(userId, role)` already exists and is true for admin or a supervisor with ≥1 supervised student (excludes advisor/committee-only users) — reuse it for group-level gates.

---

## 0. Shared prerequisite — role-aware per-student access helper  ✅ COMPLETED (4c4cba7)

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

## 1. Thesis & publication tracker  ✅ COMPLETED (92ecdf1)

**What:** structured tracking of thesis chapters and publications per student — the PhD-native backbone the app lacks.

**Data model (new):** `ThesisChapter` (studentId, title, status `planned|drafting|in_review|revising|done`, order, driveUrl?, notes?, timestamps) and `Publication` (studentId, title, venue?, type `journal|conference|preprint|other`, status `in_prep|submitted|under_review|major_rev|minor_rev|accepted|published|rejected`, authors?, url?, submittedAt?, decisionAt?, notes?, timestamps). Back-relations on `Student`.

**API:** `/api/students/[id]/thesis` and `/api/students/[id]/publications` — CRUD. Authorize with `accessForStudent` + write gated to `teamLevelForStudent ∈ {supervisor, self}` (advisor/committee read-only).

**UI:** new collapsible section on the student profile (`src/app/(app)/students/[id]/page.tsx`): chapters list (status pill, reorder) + publications table.

**Scope/risk:** medium. 2 models + migration, 2 routes, 1 profile section. Low risk. **No deps.**

**Enhancement (shipped):** chapters and publications can each point at a Google Drive file *or* folder via a `driveUrl` field (paste a Drive URL; an open-in-Drive icon shows when set). Added `Publication.driveUrl` (additive migration). Chose paste-a-link over extending the shared folders-only `DriveFolderPicker` — that component is reused elsewhere and is folder-only, so a link field works for files+folders at lower risk. A richer in-app file picker is a possible future polish.

---

## 2. Reading list (with approval flow)  ✅ COMPLETED

**Fix (post-ship):** Reading had no unread bubble and no auto-refresh. Added `User.readingLastSeenAt`; reading create/propose/decision now write `reading.*` activity logs; new `/api/reading/unread` (counted by the sidebar → violet bubble on the Reading nav, clears on /reading visit which bumps readingLastSeenAt) and `/api/reading/list` (ReadingView polls it every 15s so approvals/new items/status changes by others appear without a manual reload — mirrors the Tasks/Calendar pattern).

**Fix (2026-05-16):** removals were silent — the DELETE handler wrote no activity log, so deleting a reading never bumped the Reading bubble nor the 🔔 bell (the list itself still auto-refreshed via the 15s poll since deletes are hard deletes). Added a `reading.delete` activity log on DELETE and included `reading.delete` in both the `/api/reading/unread` filter and the bell `ACTIONS`, so a removal now signals the other side exactly like create/decide.

**Enhancement (2026-05-16, user request):** comment/reason fields so people can explain decisions. New `ReadingItem.proposalNote` (proposer's "why is this relevant?", set at create; surfaced on the propose/add form). The pre-existing `ReadingItem.decisionNote` is now actually wired to the UI: a per-item reason box appears on pending proposals; Approve/Reject send it with the status PATCH. Both the proposal note and the decision note (with `decisionBy` name) render under the item so each side sees the other's reasoning.

**What:** per-student reading list. Supervisor adds (auto-approved) or student proposes → a supervisor must approve ("OK, go ahead").

**Data model (new):** `ReadingItem` (studentId, title, authors?, url?, addedById, proposedByStudent bool, proposalNote?, status `proposed|approved|reading|done|rejected`, decisionById?, decisionNote?, timestamps).

**API:** `/api/students/[id]/reading` GET/POST; `/reading/[itemId]` PATCH/DELETE. Student POST forced `proposed`; supervisor POST `approved`; approve/reject PATCH only `teamLevelForStudent==="supervisor"`.

**UI (re-scoped on user request): a full top-level MODULE**, not a profile section — its own sidebar entry + `/reading` page, like Tasks/Calendar/Chat, to give it real prominence. Student view: their own list, propose new items, mark approved items reading/done. Supervisor/admin view: all their students' lists with a student filter, pending-proposal highlights, approve/reject, add directly (auto-approved).

**Scope/risk:** medium (model + migration + API + sidebar entry + module page). Low risk. **No deps.**

---

## 3. Private supervisor notes per student  ✅ COMPLETED

**What:** internal notes thread per student — visible to supervisor-level team only; hidden from the student, external advisors, committee.

**Data model (new):** `SupervisorNote` (studentId, authorId, body, timestamps).

**API:** `/api/students/[id]/notes` CRUD. **Server-side** authorization with `canSeeSupervisorPrivate(teamLevelForStudent(...))`. Return **404** (not 403) to non-supervisors so the feature's existence isn't leaked.

**UI:** "Private notes (supervisors only)" panel on the student profile, rendered only for supervisor-level viewers, with a clear "not visible to student / advisors / committee" banner.

**Scope/risk:** small but **high care** on the permission boundary (also exclude from activity log / notifications surfaced to students). Depends on **§0**.

---

## 4. Workload view  ✅ COMPLETED

**What:** supervisor/admin overview: per supervisor, active-student count and task load — to spot imbalance/overload.

**Data model:** none — aggregation over `User`/`Student`/`CoSupervisor`/`Ticket`.

**UI:** new "Workload" table/tab in `src/app/(app)/team/page.tsx`. Per supervisor: # active students (reuse the dedup logic already in the Team page), # open tasks, # overdue, # tasks assigned to them. Sortable. Team page already excludes students.

**Shipped:** two tables on the Team page — *Workload* per supervisor (students supervised/active, open tasks, overdue, assigned to them) **and** *Student workload* per student (supervisor, status, open, overdue, click-through to the student). The student-load angle was added on user request so supervisors can spot which students are overloaded/idle, not just which supervisors are.

**Scope/risk:** small, read-only, no migration. Low risk. **No deps** (richer once §1 milestones exist).

---

## 5. Recurring calendar events  ✅ COMPLETED (MVP)

**What:** events that repeat (daily/weekly/monthly) with an interval and an end (until-date or count). Foundational calendar capability that §8 (meetings) and §9 (availability) can build on.

**Data model:** add to `Event` an `recurrenceRule String?` storing an iCal **RRULE** (e.g. `FREQ=WEEKLY;INTERVAL=1;UNTIL=20261231`). RRULE is the standard and Google Calendar API accepts `recurrence: ['RRULE:...']` directly — so syncing recurrence to Google is essentially free. Also `recurrenceParentId String?` for future per-instance exceptions (not implemented in MVP).

**API:** extend event create/patch to accept a structured recurrence (freq, interval, until|count) → serialize to RRULE; pass through to Google when pushing. In-app: expand occurrences for the visible range when rendering the grid (don't store every instance).

**UI:** recurrence picker in the new/edit event dialog (Does not repeat / Daily / Weekly / Monthly + interval + ends on/after). Recurring instances badged in the grid.

**MVP boundary:** simple recurrence only — **no** per-instance edits/exceptions, **no** "this and following". Editing a series edits all future occurrences. Document this limitation in the UI.

**Scope/risk:** medium-high — recurrence is a classic complexity sink; the MVP boundary keeps it contained. Additive migration. **No deps**; do before §8/§9 so they can be recurring.

---

## 6. Weekly async check-in  ✅ COMPLETED

**What:** 2-minute weekly student update: did / blockers / next / wellbeing 1–5. Async; wellbeing trend is an early-warning signal.

**Data model (new):** `CheckIn` (studentId, weekOf DateTime, did?, blockers?, next?, wellbeing Int?, timestamps, `@@unique([studentId, weekOf])`).

**API:** `/api/students/[id]/checkins` GET/POST (upsert current week). Student writes own; team reads.

**UI:** student dashboard card "Your weekly check-in is due" → form. Supervisor view on the student profile: history + wellbeing sparkline; optionally surface low wellbeing on the Workload view.

**Permissions:** student writes own; the `did/blockers/next` text is readable by the whole team, but the **wellbeing score is supervisor-level only** (`canSeeSupervisorPrivate`) — hidden from external advisors, committee, and the student's other non-supervisor viewers. Enforce server-side (omit the field from API responses for non-supervisors).

**Scope/risk:** small-medium. 1 model + migration. Low risk. Feeds §10 and §11. Depends on **§0** for the wellbeing gate.

---

## 7. Supervisor team workspace (group-level)  ✅ COMPLETED

**What:** a group-level space for the supervisory team — a **shared Drive folder** + **group notes** (not tied to a specific student): templates, group policy, inter-supervisor minutes. Hidden from students, external advisors, committee.

**Data model (new):** `TeamNote` (authorId, body, timestamps) — group-scoped, not student-scoped. Plus an admin-set setting for the shared Drive folder URL (a single app-level config row, e.g. a `Setting` key/value model, or an env-less DB setting `teamDriveFolderUrl`).

**API:** `/api/team/notes` CRUD and `/api/team/workspace` for the folder URL. Authorize with `isSupervisingUser(userId, role)` (admin or real supervisor) — **not** advisor/committee, **not** students. 404 to others.

**UI:** new "Team workspace" area for supervisors (a tab in the Team module, or a sidebar entry shown only to supervisor-level users): the shared-folder link + a group notes thread.

**Scope/risk:** medium. 1–2 small models + migration. Low-medium risk; permission gate is the careful part (reuse `isSupervisingUser`). **No deps.**

---

## 8. Structured 1:1 meetings  ✅ COMPLETED

**What:** turn a meeting from a bare calendar event into a workflow: agenda (before) → notes (during) → action items (after) that convert into Tasks.

**Data model:** extend `Event`: `isMeeting Boolean @default(false)`, `agenda String?` (JSON `{id,text,addedById}[]`), `meetingNotes String?`. Action items become real `Ticket` rows on convert.

**API:** extend `/api/calendar/events/[id]` PATCH for `agenda`/`meetingNotes`; new `/api/calendar/events/[id]/action-items` POST → creates Tickets (studentId from event, per-item assignee + due date) and logs `ticket.create`.

**UI:** in the event dialog, when `isMeeting`: Agenda (team + student add bullets pre-meeting), Notes, Action items (assignee + due date + "Create tasks"). New-event dialog gets an "Is a 1:1 meeting" toggle. Can be recurring if §5 is done.

**Scope/risk:** medium-high — touches Calendar **and** Tasks. Additive migration. Most valuable after §1; best after §5 so meetings can recur.

**Enhancement (2026-05-16, user request):** the action-item composer now takes an optional **deadline (date), priority and category** per item (defaults preserved: medium / "meeting"); `/api/calendar/events/[id]/action-items` accepts `priority`/`category` and applies them. Pending items show priority/category/due badges. Helper text points the user to the Task panel for fuller detailing.

**Fix (2026-05-16):** unassigned (general) events — `studentId = null` — were excluded by both the calendar page-load query and the live-poll list endpoint (`studentId: { in: studentIds }` never matches null). Effect: a freshly created unassigned event showed optimistically, then the 8s poll didn't return it so the diff logic flagged it as **deleted** (struck-through ghost); after reload it vanished entirely. Both queries now `OR` in `{ studentId: null }` when no student filter is applied, matching the existing notification/highlight model (which already treats null-student events as visible to everyone). Unassigned events are therefore visible to all roles.

**Enhancement (2026-05-16, user request):** sub-tasks can each have their **own deadline**. Rule: a sub-task's deadline may never be after the parent task's deadline — validated server-side in `tickets/[id]` PATCH against the *effective* state (so lowering the task's date is also caught) returning a 400 with a clear message, and pre-validated client-side so the kanban dialog shows the error inline and never persists a bad value. Sub-tasks **with** a deadline are mirrored on the **in-app calendar** as all-day `[Sub-task] <text> · <task>` events (`syncSubtaskDueEvents`; new `Event.subtaskParentId`+`subtaskKey`, cascade-on-delete; migration `20260516100133_subtask_due_events`); sub-tasks without a deadline never appear. **Scope:** in-app calendar only — *not* pushed to Google (unlike the task's own due event), to keep the Google surface small. Pruned on date-clear / sub-task removal / task archive; recreated on restore.

---

## 9. Supervisor free/busy availability (travel / leave / holidays)  ✅ COMPLETED

**Fix (post-ship):** availability now renders in **all** calendar views — Month (chip), Year (greyed day + tooltip), Week/Day (header "⊘ Unavailable" banner), not just Month. And marking availability now writes an `availability.create` activity-log row per affected student, which `/api/calendar/unread` counts → the student's Calendar **sidebar bubble number** increments (clears on their next /calendar visit). Label still never exposed to students.

**What:** *not* a weekly chore. Occasionally a supervisor marks a period they're **away/unavailable** (conference travel, medical leave, holidays) so their students know not to expect them / when they're back. Students see a human-labelled away block, not the supervisor's full calendar.

**Data model (new):** `Availability` (userId = supervisor, startsAt, endsAt, `label` for the supervisor's own reference e.g. "Conference travel", kind `away|busy`, optional `recurrenceRule` reusing §5, timestamps). Dedicated model so it never pollutes student task/event data and can be styled distinctly.

**API:** `/api/availability` CRUD for the signed-in supervisor; read endpoint returns availability of a given student's supervisors. Students may read their own supervisors' availability; supervisors write only their own. **The read endpoint must NOT return `label` to students** — students only ever see an opaque "Unavailable" block (decided). The label is for the supervisor's own management view only.

**UI:** supervisor adds entries from their calendar view ("I'm away…", with a label they pick for themselves). On a student's calendar, a distinct "Supervisors' availability" overlay/panel showing each supervisor's periods as **"Unavailable"** only — no label, no reason.

**Scope/risk:** medium. 1 model + migration; calendar UI on both sides. Reuses §5 recurrence if present. **Soft dep on §5** (recurring absences) but works standalone for one-off periods.

---

## 10. Annual review export  ✅ COMPLETED

**What:** one-click formal progress packet per student for a date range.

**Composes:** §1 chapters/pubs, tasks (completed/overdue in range), §8 meetings, §6 check-ins (text only — **never** the wellbeing score), calendar events, activity log. **Never includes §3 private supervisor notes** (no toggle — hard exclusion).

**Implementation:** MVP = print-styled HTML page `/students/[id]/review?from=&to=` (server component + `@media print`); user does Cmd+P → Save as PDF. Avoids a server PDF pipeline/new dependency. True server PDF later if needed.

**Permissions:** supervisors + admin can generate it. **External advisors and committee may view it read-only** (decided). Students: per existing pattern, view their own. Private notes and wellbeing scores are excluded from the rendered packet regardless of viewer.

**Scope/risk:** medium, no migration. **Depends on §1; richer with §6/§8.**

---

## 11. Email digest  ✅ COMPLETED (needs RESEND_API_KEY + DIGEST_CRON_SECRET on Vercel to actually send)

**What:** scheduled email (e.g. Mon 08:00) per supervisor: students with overdue tasks, pending reading approvals, new check-ins (esp. low wellbeing), milestones hit, comments awaiting reply.

**Shared infra (also powers §12):** email provider **Resend** (new dep `resend`, env `RESEND_API_KEY`, `DIGEST_CRON_SECRET`). Vercel Cron (reuse the chat-cleanup cron pattern) → `/api/cron/weekly-digest` with `Bearer ${DIGEST_CRON_SECRET}` header check. Iterates supervisors, composes per-supervisor summary, sends via Resend. Per-user opt-out: `User.emailDigest Boolean @default(true)` (small migration).

**Scope/risk:** medium. New external dep + secret + cron. Basic digest can ship before §1/§6/§8 and get richer as they land — so **do near-last**.

---

## 12. Real notifications  ✅ COMPLETED (in-app bell + best-effort email; web push deferred)

**What:** event-triggered, immediate alerts (vs. §11's scheduled summary): a task assigned to you was created, a task you own is due tomorrow, an @mention, a meeting in 1 hour, a reading-list decision, a new check-in for your student.

**Implementation (this wave = email + in-app, decided):** two delivery channels off the same event hooks (the API routes that already `logActivity`):

- **Email**: reuse the §11 Resend infra — fire-and-forget transactional email on key events.
- **In-app notification center**: new `Notification` model (`userId`, `type`, `message`, `link`, `readAt?`, `createdAt`); a 🔔 bell in the topbar with an unread count and a dropdown list; endpoints to list and mark-read (single + all). The bell polls like the existing sidebar badges, or reuses that polling cycle.

Per-user, per-type preferences (extend the Settings page; a `NotificationPref` model or JSON on `User`) covering both channels.

**Deferred to a later wave:** browser/web push (service worker + VAPID) — separate infra, not needed for in-app + email.

**Post-ship fix (2026-05-16):** the bell relied on the sparse `Notification` table (only written on task-assign and task-comment), so it stayed empty and "did not work". Rebuilt `/api/notifications` to derive the feed from the **ActivityLog** (the single source of truth that already records every cross-user change — tasks, events, reading, availability), scoped to students the viewer can see and excluding the viewer's own actions. Unread count is now the number of those entries since a new per-user `User.notificationsLastSeenAt` timestamp; "Mark all read" advances that timestamp. Per-item read isn't tracked (the feed is log-derived) — clicking an item just navigates to it. Consistent with the standing rule: a bubble/alert appears whenever someone changes something others can see.

**Scope/risk:** medium-high (two channels + bell UI + read-state). **Depends on §11 infra.** Do **last**.

---

## 14. Undo for destructive actions (soft-delete + undo toast)  ✅ COMPLETED (Tasks-scoped MVP; other models a follow-up)

**What:** not a true universal multi-level undo (that needs a command/event-sourcing layer this CRUD app isn't built for). Instead, scoped undo for the only high-regret action — **deletion**. Soft-delete instead of hard `DELETE`, plus an "Undo" toast for ~5 s after any delete. Edits are low-stakes and already traceable via the activity log, so they're out of scope.

**Data model:** add a nullable `archivedAt DateTime?` (or `deletedAt`) to every user-deletable model — `Ticket`, `Event`, `ThesisChapter`, `Publication`, `Comment`, `Channel`, `CoSupervisor`, plus future §3/§6/§9 models. Additive migration.

**API:** delete endpoints set `archivedAt = now()` instead of removing the row; an `undo` endpoint clears it (allowed for a short window). A periodic job (reuse the chat-cleanup cron pattern) hard-purges rows archived > N days so the DB doesn't grow unbounded.

**Read paths:** every list/detail query must exclude `archivedAt != null`. This is the bulk of the work — mechanical but touches many queries. A Prisma middleware/extension that auto-filters soft-deleted rows reduces the per-query churn and the risk of leaking archived data.

**UI:** after a delete, a toast: *"Task deleted · Undo"*. Clicking Undo calls the undo endpoint and restores it (pairs naturally with the existing ghost-card/optimistic patterns). No toast framework yet — small shared toast component needed.

**Scope/risk:** medium. The migration is additive/low-risk; the real cost and risk is auditing **every** read query for the soft-delete filter (a missed filter = deleted data still showing). Prisma middleware mitigates this. **No hard deps**; best done after the data models from earlier items exist so it can cover them in one pass. Could also be done incrementally per-model.

**Shipped (Tasks-scoped MVP):** `Ticket.archivedAt` (additive migration). Task DELETE now soft-deletes (sets `archivedAt`, removes the Google calendar mirror); new `/api/tickets/[id]/restore` clears it and re-syncs the due event. All task read sites audited and filtered (`/api/tickets/list`, kanban page, dashboard counts + recent, team workload + relation `_count`, student-profile recent tasks). An **Undo toast** appears bottom-center after deleting a task on the board (7 s, calls restore). **Deliberately scoped to Tasks** — the highest-regret deletion — done incrementally per the plan's own "could also be done incrementally per-model" note. Remaining models (Event, ThesisChapter, Publication, Comment, Channel, ReadingItem, …) + automated purge of old archived rows are a documented follow-up; not done to avoid a high-risk app-wide read-query sweep in one pass. **Audit-gap fix (2026-05-18):** the `/students` list card `_count.tickets` was missed by the original sweep (it still counted archived tasks, so the number never decremented on delete) — now `tickets: { where: { archivedAt: null } }`, consistent with `/` and `/team`.

**Why scoped, not global:** a true app-wide undo (reverse any mutation) would require recording inverse operations for every action — a large architectural change for marginal benefit over "you can't accidentally lose data on delete," which this covers.

---

## 15. Team Advisor role + advisor-suggestions channel  ✅ COMPLETED (2026-05-16, user request)

**What:** a new global `User.role = "team_advisor"` — a senior *internal* member (distinct from per-student "external advisors", who are outside the institution) who follows **every** student **read-only** and whose only action is sending suggestions to the supervisors. No student can hold the role; it's assigned by the admin via the user's profile role dropdown / Admin panel (not the per-student "add team member" flow, which is link-based).

**Privacy decision (user, confirmed):** *full* visibility — Team Advisors see everything supervisors see for every student, **including** supervisor-private notes and 1–5 wellbeing scores. The only thing kept supervisor-only is the supervisors' own internal *Supervisor team workspace* notes (the supervisors' back-channel; advisors post to the separate suggestions thread instead).

**Channel decision (user, confirmed):** suggestions live in the **Team module**, not Chat — a dedicated *Advisor suggestions* thread. Each suggestion can tag one/more students or none (general). Chat stays student↔supervisor 1:1s.

**Access model (the crux — read-all, write-none):** `team_advisor` resolves to `accessForStudent → null` (no write anywhere — all write gates require `canWriteForStudent`/`teamLevel==="supervisor"`/non-student-role and so reject it) and `teamLevelForStudent → "observer"` (a new `TeamLevel`, non-null so detail/review pages render). `canSeeSupervisorPrivate` now also accepts `"observer"`; a new `canWriteSupervisorPrivate` (supervisor-only) splits private READ from WRITE so the notes-POST can't leak. `studentVisibilityWhere*` returns `{}` (all students) for `team_advisor`. Two pre-existing `role === "student"`-only deny gates that a non-student would slip through (supervisor-note POST, availability POST) were tightened. `src/auth.ts` ranks `team_advisor` above student/supervisor so the env allowlist can't downgrade a DB-assigned advisor on login.

**Data model:** `AdvisorSuggestion` (authorId, body, `studentIds String[]` = optional tags, timestamps) + `User.teamSuggestionsLastSeenAt` (additive migration `20260516092512_advisor_suggestions`).

**API:** `/api/team/suggestions` GET (supervisors+admin+advisors) / POST (advisors+admin only); `/api/team/suggestions/[id]` DELETE (author/admin); `/api/team/unread` drives a new violet Team-sidebar bubble (cleared on /team visit which bumps `teamSuggestionsLastSeenAt`). Not routed through the student-visible 🔔 bell to avoid leaking advisor↔supervisor traffic to students.

**UI:** Team page gains a "Team advisors" roster section + the "Advisor suggestions" card (composer with multi-student tag chips for advisors; read + delete-own for supervisors). Create buttons (New task / New event / My availability / propose-add reading) hidden for observers; Log book opened to them (following activity is their purpose).

**Scope/risk:** medium-high (128 auth call-sites mapped first). Correctness property — *team_advisor can read everything, write nothing except suggestions* — verified gate-by-gate. Out of scope: advisors reading the supervisors' internal workspace notes (kept supervisor-only); per-instance suggestion read receipts.

**Rework (2026-05-16, user follow-up): team advisor is now PER-STUDENT, not a global role.** The global `User.role = "team_advisor"` made "supervisor" and "team advisor" mutually exclusive; the user needs one person to supervise student A *and* team-advise student B. So `team_advisor` became a `CoSupervisor.role` value (like `external_advisor`/`committee`), assignable per student via **Manage team** or the admin **Add team member** form (same `CoSupervisor` row → consistent). Global-role plumbing reverted (profile dropdown, admin ROLE_GROUPS, users-PATCH zod, `src/auth.ts` AppRole+rank, next-auth type, layout/log/kanban/calendar/availability `team_advisor` branches). Access model: `accessForStudent` **excludes** `team_advisor` co-rows (never write); `teamLevelForStudent` maps a `team_advisor` co-row → `"observer"` (full read incl. private; `canSeeSupervisorPrivate("observer")` true, `canWriteSupervisorPrivate` supervisor-only); `loadOwned` (cosupervisors API) excludes `team_advisor` so they can't manage a team; `studentVisibilityWhere` already includes co-rows so they see their advised students. Suggestions gate is now `isTeamAdvisorAnywhere(userId)` (≥1 `team_advisor` co-row) rather than a global role. The Team page is now **one unified "Team members" list** with a per-member role breakdown + student names (Supervisor of / Team advisor of / External advisor of / Committee for), replacing the mutually-exclusive role cards — directly answering "for every member, who supervises / team-advises / both, and for whom". Migration `20260516092512_advisor_suggestions` still applies (model unchanged). Note: any user left at the now-removed global `User.role="team_advisor"` is normalised to their env role on next login — re-add them via Manage team.

---

## 16. Task dependencies + Gantt view  ✅ COMPLETED (2026-05-18, user request)

**What:** when defining or editing a task you can mark it as depending on one or more existing tasks ("parent" tasks). A task with any unfinished parent is auto-moved to **Blocked**; once *all* parents are **Done** it auto-moves to **To do** (and re-blocks if a parent is reopened). Plus a third Tasks view — a **Gantt** timeline — alongside Board and List.

**Data model (new):** explicit join model `TaskDependency` (`id`, `dependentId`, `dependsOnId`, `@@unique([dependentId, dependsOnId])`, `@@index([dependsOnId])`, both FKs → `Ticket` with `onDelete: Cascade`). Ticket gains self-relations `dependsOn TaskDependency[] @relation("Dependent")` and `dependents TaskDependency[] @relation("DependsOn")`. Hand-written additive migration `20260518100556_task_dependencies` (offline pattern — `prisma migrate diff` needs a live DB; applied on Vercel deploy).

**Engine:** `src/lib/task-deps.ts` — `wouldCreateCycle()` (DFS over dependsOn edges, rejects self + loops), `setDependencies()` (validates same-student + no cycle, then replaces the set), `applyDependencyGate()` (no deps / already Done → no-op; any parent ≠ done → force `blocked`; all parents done & currently `blocked` → `todo`), `propagateFrom()` (re-gates direct dependents on a status change + logs `ticket.update`). The gate **only** manages tasks that have dependencies and never overrides `done` — manual statuses on undependent tasks are untouched.

**API:** `tickets` POST and `tickets/[id]` PATCH accept `dependsOnIds: string[]`. POST runs setDependencies + gate after create and **rolls back the just-created row** on a bad dependency (cycle/cross-student) → 400. PATCH validates **before** the ticket mutation (no partial write), then re-gates self + propagates to dependents after. `/api/tickets/list` and the kanban page include `dependsOn {dependsOnId}` → `dependsOnIds[]` (+ `createdAt`) on the shared client `Ticket`.

**UI:** reusable `DependencyPicker` — a drop-down **selector** of same-student tasks (excludes self) that adds each pick as a removable status-dotted chip — in the New- and Edit-task dialogs. (The task's Drive-folder field in the same dialogs was also upgraded from a paste-a-URL input to the browse-and-pick `DriveFolderPicker` with an Open-folder button.) New **Gantt** view (`src/app/(app)/kanban/gantt-view.tsx`) — deliberately **no external Gantt library**: a CSS positioned-bar timeline grouped by student, weekly gridlines, dashed "today" line, status-coloured bars (dimmed when Done, red outline when overdue), ⛓ marker for tasks with dependencies; click a bar/label to open the task. Wired as the third tab in the kanban view switcher (`board | list | gantt`).

**Scope/risk:** medium. Migration additive/low-risk. Main care: cycle/cross-student rejection and ordering writes so a bad dependency never half-applies. The auto Blocked↔To do transitions are documented in all three manuals (don't drag a gated task out of Blocked by hand — finish its parents).

---

## 17. Event ↔ Task manual link  ✅ COMPLETED (2026-05-18, user request)

**What:** when creating/editing a calendar Event, optionally connect it to an existing Task. Distinct from the existing automatic behaviour where a task's *due date* is mirrored as a `[Task]_` calendar entry — this is for events that merely *relate to* a task (e.g. a supervision meeting whose agenda includes a task due later).

**Data model:** new nullable `Event.linkedTaskId` + relation `linkedTask Ticket? @relation("RelatedTaskEvents", onDelete: SetNull)`, Ticket back-relation `linkedEvents`, `@@index([linkedTaskId])`. Hand-written additive migration `20260518140000_event_linked_task`. Deliberately a **separate column from `Event.ticketId`**: `ticketId` is `@unique` + cascade (one auto due-event per task, relation `TaskDueEvent`); `linkedTaskId` is many-events-to-one-task, SetNull (the meeting outlives the task), and is never rendered as a task-event chip.

**API:** `POST /api/calendar/events` and `PATCH /api/calendar/events/[id]` accept `linkedTaskId` (string | null). Validated: the ticket must exist, be `archivedAt: null`, and pass `studentVisibilityWhereAllForAdmin` for the caller (else 400). `/calendar` page + `/api/calendar/events/list` poll now `include` `linkedTask {id,title}` and expose `linkedTaskId` / `linkedTaskTitle`; the page also hands `CalendarView` a `tasks` list (visible non-archived tickets) for the picker.

**UI:** a **Related task** picker (`Select`) in the New- and Edit-event dialogs — scoped to the chosen/event student, otherwise all visible tasks prefixed with the student name. The edit form pins the current link into the option list even if it falls outside the student scope, so editing unrelated fields can't silently unlink. The event-detail dialog shows a **Related task: …** row that opens the existing in-place `TaskPeek` (the handler closes the event dialog first to avoid stacked modals — consistent with the Calendar/Log task-peek pattern).

**Scope/risk:** low–medium, additive migration. No change to the existing task-due sync path. Main care taken: not overloading `ticketId`, validating link visibility server-side, and the don't-silently-unlink guard in the edit form.

---

## 18. Feedback / suggestion mailbox  ✅ COMPLETED (2026-05-18, user request)

**What:** any user (student, supervisor, co-supervisor, advisor, committee, admin) can send the administrators a **bug report**, **improvement suggestion**, or **other** feedback. Admins triage with a status and can reply; submitters track their own items and see replies.

**Data model:** new `Feedback` (`authorId`→User cascade, `kind` `bug|idea|other`, `subject`, `body`, `status` `open|planned|in_progress|done|declined`, `adminReply?`, `repliedById?`→User SetNull, `repliedAt?`, timestamps; `@@index` authorId/status/createdAt) + `User.feedbackLastSeenAt`. Hand-written additive migration `20260518150000_feedback`.

**API:** `POST /api/feedback` (any authed user; zod kind/subject/body) → notifies every `role:"admin"` via `notify()` (Notification row + best-effort email). `GET /api/feedback` → all to admins (optional `status`/`kind` filters), own-only to non-admins (author identity withheld from non-admins). `PATCH /api/feedback/[id]` admin-only (status / reply; stamps `repliedById`+`repliedAt` on real reply change; notifies the submitter). `DELETE` = author (own) or admin. `/api/feedback/unread` → violet sidebar bubble (admins: others' new submissions since `feedbackLastSeenAt`; others: own items replied-to since), reset when `/feedback` is opened.

**UI:** new sidebar entry **Feedback** (📣, all roles). `/feedback` page: kind/subject/body composer for everyone; admins additionally get status+kind filters, an inline status `Select`, a reply box, and author attribution. Submitter sees their items with status + inline admin reply.

**Scope/risk:** low. Additive migration, no changes to existing modules. Not wired into the ActivityLog-derived 🔔 bell — the dedicated sidebar bubble + best-effort email are the surfaces (mirrors the advisor-suggestions design).

---

## 19. Chat "Seen" receipts + leaner activity log  ✅ COMPLETED (2026-05-18, user request)

**What:** (a) WhatsApp-style **"Seen by"** receipts in chat; (b) the activity log records **only material, confirmed changes** with **succinct, self-explanatory** summaries (it was logging every auto-save with raw field names).

**Chat seen:** no schema change — `ChannelMember.lastRead` already exists and is kept fresh by the `/read` POST + message send. `GET /api/channels/[id]/messages` now also returns `reads` (each member's `userId`, `lastRead`, and `{name,image,color}`). `chat-view` finds the viewer's latest message and the other members who've read up to it, showing one **"Seen by" + xs avatar(s)** line under that message. Latency ≈ the existing 3.5 s poll.

**Leaner log:** `logActivity()` gained optional `coalesce`/`coalesceWindowMs` — a same actor/action/entity row within the window is updated in place (summary/details/createdAt bumped, `readBy` reset) instead of inserting. The `ticket.update` handler now diffs the patch against the current ticket and **skips logging entirely when nothing materially changed** (no-op blurs, reverted edits), and builds a human summary (`“Title” — moved to In progress, due May 20`) from `kanban-constants` labels + date-fns instead of `updated task (status, completionRequestedAt)`. Minor text edits coalesce (3-min window) into one row; significant workflow changes (status/priority/assignee/due/deps) stay as separate entries.

**Scope/risk:** low. No schema/migration. Coalescing is opt-in per call site (only `ticket.update` uses it so far); other log call sites unchanged. Pre-existing log rows are not retro-edited.

---

## 20. General calendar config + event student reassignment  ✅ COMPLETED (2026-05-18, user request)

**What:** (a) admin can define the **General calendar** used for unassigned events and tasks-without-a-student-calendar; (b) an existing event can be **(re)assigned to a student** (or unassigned) from the Edit dialog; (c) cosmetic: student profile says "Tasks" not "Tickets".

**General calendar:** reuses the existing key/value `Setting` table — new key `generalCalendarId`. `getGeneralCalendarId()` (`src/lib/general-calendar.ts`) returns it normalized. Google-push target is now `student.calendarId → generalCalendarId → "primary"` in `POST /api/calendar/events` and `task-event-sync.ts`. Admin-only `GET|PUT /api/admin/general-calendar` + a **General calendar** card on `/admin`. No migration (Setting already exists).

**Event reassignment:** `PATCH /api/calendar/events/[id]` now accepts `studentId` (assign requires `canWriteForStudent` for the new student; unassign is supervisor/admin only). Edit-event dialog gained a **Student** select (non-students only) that also re-scopes the Related-task picker. Local-data change only — doesn't migrate an already-pushed Google event between calendars (documented).

**Scope/risk:** low. No schema/migration (Setting reused). Main care: permission-checking the *new* student on reassign, and not overloading the calendar-target fallback order.

---

## 21. Chat WhatsApp ticks + feedback photo  ✅ COMPLETED (2026-05-18, user + Bruno request)

**What:** (a) replace the chat "Seen by avatar" with WhatsApp-style delivery ticks; (b) let a feedback submission include an optional photo (Bruno's suggestion: "upload an optional photo to better address the problem").

**Ticks:** purely client-side over the existing `reads` payload (no schema). Per the sender's own message: one grey ✓ = sent (no other member yet), two grey ✓✓ = delivered (≥1 other `ChannelMember`), two blue ✓✓ = seen (a member's `lastRead ≥ message.createdAt`). Caveat: no real device-delivery signal exists (opening a channel marks read almost instantly here), so "delivered" ≈ "channel has another participant" — honest given the data, matches the WhatsApp visual.

**Feedback photo:** additive `Feedback.imageUrl` (migration `20260518160000_feedback_image`); image-only `POST /api/feedback/upload` (Vercel Blob `feedback/…`, 10 MB, png/jpg/webp/gif); composer attach-with-preview; `POST /api/feedback` accepts `imageUrl`; item + admin triage render the screenshot with click-to-open.

**Scope/risk:** low. One additive migration. Ticks no migration. Reused the existing Blob upload pattern.

---

## 22. Student "Catch-up" digest  ✅ COMPLETED (2026-05-18, user request)

**What:** a one-click, read-only **Catch-up** button on the student profile (non-students only) that pops a plain-text summary to get up to speed on a student fast — tasks (ongoing / future / overdue / blocked / not started / recently done), upcoming & recent events, thesis & publication status, latest check-in.

**Implementation:** `GET /api/students/[id]/summary` builds the text server-side from `ticket`/`event`/`thesisChapter`/`publication`/`checkIn` reads. Events exclude the `[Task]_`/`[Sub-task]_` mirror rows. Access via `teamLevelForStudent` — denies `student`, `null`, `self`; wellbeing only for `canSeeSupervisorPrivate`. Client `StudentCatchupButton` opens a dialog, fetches on open, renders in a `<pre>` with a **Copy** button. No schema/migration (pure aggregation, like §4 Workload).

**Scope/risk:** low. Read-only, visibility-gated server-side; the button's client gate is just UX (server is authoritative).

---

## 23. Browser-tab chat alerts  ✅ COMPLETED (2026-05-18, Bruno request)

**What:** like Google Chat — tab title + favicon change on unread chat, plus a sound, so messages aren't missed when PhDapp isn't the focused tab.

**Implementation:** `TabAlerts` client component (mounted once in the `(app)` layout) polls `/api/chat/unread` every 5 s. Unread > 0 → `document.title = "(N) <sender> messaged you – <base>"` + a canvas-drawn favicon with a red count badge (`<link id="phdapp-fav">`); cleared at 0. A short two-tone WebAudio beep on count increase (not first poll), muted via `localStorage["phdapp.muteChat"]="1"`. `/api/chat/unread` extended with `latestSender`. No assets/schema/migration.

**Scope/risk:** low. Chat-only. Audio is best-effort (browser autoplay policy — caught). Favicon is generated at runtime (no prior favicon existed, so this also gives the app one).

---

## 24. Auto team channel + calendar ghost-event fix + alias consistency  ✅ COMPLETED (2026-05-18, user request)

**Calendar ghost bug:** the live poll flagged any event missing from the latest result as a deleted "ghost" — but the result is windowed (month/year) and student-filtered, so navigating/filtering wrongly ghosted out-of-scope events (the reported bug). Fix: only diff for deletions when the `from|to|student|view` poll key is unchanged between consecutive polls; exclude task/sub-task mirror events, recurring synthetics, and linked-task events (they disappear for non-deletion reasons). Real same-window deletions still surface.

**Auto team channel:** `ensureTeamChannel(studentId)` (idempotent) creates a `Team · <displayName>` channel (`kind:"student"`, members = supervisor + non-team-advisor co-sups + student user). Called on `POST /api/students` (replaces the old creator-only "1:1" channel); existing students backfilled via admin-only `POST /api/admin/backfill-team-channels` + an Admin → Maintenance button (no duplicates — skips students that already have a channel).

**Alias consistency:** display already used the alias-aware `displayName()` app-wide; switched the last few raw-`fullName` non-profile strings (a toast, a Google-access warning, the delete activity summary) to `alias || fullName`. Profile/edit/annual-review intentionally keep the legal full name.

**Scope/risk:** low. No schema/migration (channels/relations already exist). Backfill is idempotent and admin-gated.

---

## 25. Calendar overlap layout + "+N more" + collapsible feedback  ✅ COMPLETED (2026-05-18, user request)

**What:** (1) overlapping week/day events sit side-by-side instead of stacking; (2) Month "+N more" opens that day's Day view; (3) feedback entries can be collapsed.

**Implementation:** `layoutDay(evs)` greedily column-packs each overlap cluster → `{top,height,leftPct,widthPct}`; week/day events positioned with computed `left/width` + `hover:z-20`. Month "+N more" became a button calling `setCursor(day)`+`setView("day")`. Feedback: a `collapsed` id-Set with a clickable chevron header per card and an Expand/Collapse-all toggle; collapsed cards show only the title row.

**Scope/risk:** low. Pure presentational; no schema/API/migration.

---

## 26. Chat batch: reply, edit-channel, drop/paste, sound, fixes  ✅ COMPLETED (2026-05-18, user request)

**What:** message **replies**; full **channel editing** (name/description/colour/**members**, member changes confirmed, allowed for any member); **drag-and-drop** + **Ctrl/Cmd+V paste** uploads; notification **sound type + volume** config; fix the favicon vanishing when chat is read; stop **deleted (orphan) students** appearing in member pickers.

**Implementation:** additive `Message.replyToId` self-relation (migration `20260518170000_message_reply`) threaded through the messages API + UI (quoted bubble + composer reply bar). `PATCH /api/channels/[id]` extended with `color`+`memberIds` (validated full-set replace) behind an `EditChannelDialog` (replaces the `prompt()` rename). `chat-sound.ts` centralises a configurable WebAudio sound (localStorage), used by both `TabAlerts` and a `SoundSettingsDialog`. Favicon now always redrawn (brand tile, badge only when unread). Chat member query filters out student-role users with no `studentProfile`.

**Scope/risk:** low–medium. One additive migration; the rest API/UI. Member-set replace is the main correctness point (validated against real users; confirm-gated in UI).

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
14. **§14** Undo / soft-delete — best after the data models from earlier items exist so one pass covers them all; can also be done incrementally per-model.

Each ships as its own commit + deploy, verified before moving on.

## Non-goals for this wave

- **AI integration** — deferred (no shared team key). See the FUTURE section below.
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

**Enhancement (2026-05-18, user request): task-completion approval + category set.** Students cannot set a task to **Done** — server-enforced in `tickets` POST and `tickets/[id]` PATCH (403 unless `accessForStudent==="supervisor"`). They "Mark as completed" → `{requestCompletion:true}` sets the additive `Ticket.completionRequestedAt`, logs `ticket.completion_requested` (wired into the bell ACTIONS + `/api/kanban/unread` + the layout Tasks-badge filters) and best-effort `notify()`s the student's supervisors; a supervisor then moves it to Done (which clears the flag). Dragging a card to Done as a student is treated as the same request. Supervisors are also notified of ordinary student status changes via the existing `ticket.update` activity. Categories: `experiment` **id kept** (no data migration) but **relabelled "Lab work"**; added **"IC Design"** (`ic_design`) and **"Coding"** (`coding`); kanban card now shows the category label. Migration `..._ticket_completion_requested` (additive).

**Enhancement (2026-05-18, user request): Task Groups (3-level hierarchy) + calendar/UX fixes.** New `TaskGroup` model (per-student) + nullable `Ticket.groupId` (migration `..._task_groups`, additive, FK SET NULL). `/api/task-groups` POST (create from selected tasks — same student, `canWriteForStudent`), `[id]` PATCH (rename) / DELETE (disband = ungroup then delete); per-task ungroup via `tickets/[id]` PATCH `{groupId:null}`. Kanban **List** view rebuilt: multi-select checkboxes + "Create group" bar, renders **Student → Group → Task → Subtask** (subtasks shown inline). Calendar task-event titles now prefixed `"[Task]_"` / `"[Sub-task]_"` and the prefix is **shown** (no longer stripped) so task-derived events are recognisable incl. on Google; clicking still opens the in-place TaskPeek (closing stays in Calendar/Log — already shipped `ab18d85`). The kanban "All students" filter is hidden for student viewers. Student-profile "Expected end" restyled (Flag icon + uppercase label, consistent with the other header meta).

## FUTURE (deferred beyond this wave)

- **AI integration** — summaries, meeting-agenda drafting, freeform→tasks, thread digests. Deferred: the supervisor team has no single shared API key, and BYOK adds too much per-user setup friction for now. Revisit if/when an org key or budget exists. Must be strictly grounded in DB data (no hallucinated progress) when built.

- **Activate the email digest from a dedicated PhDapp sender (NOT active yet)** — the weekly-digest + per-event email code is shipped (§11/§12) but **dormant**: it no-ops until `RESEND_API_KEY` is set on Vercel, and the default `From` is Resend's sandbox `onboarding@resend.dev` (only delivers to the Resend account owner). **Ideal end state:** the app emails **both supervisors and team advisors** from a dedicated PhDapp address (e.g. `weekly_digest@phdapp.com`) on a verified domain. Work needed when picked up: (1) own a domain + verify it in Resend, set `DIGEST_FROM` (or a new neutral `EMAIL_FROM`) to e.g. `PhDapp <weekly_digest@phdapp.com>`, add `RESEND_API_KEY` + `DIGEST_CRON_SECRET` on Vercel, redeploy; (2) **extend the digest recipient query to include team advisors** — currently `/api/cron/weekly-digest` only targets `role ∈ {admin,supervisor}` with `supervisor`/`co_supervisor` co-rows, so team advisors get nothing; give them a read-only digest scoped to the students they advise (e.g. overdue tasks / pending readings / new check-ins for their `team_advisor` co-row students, no wellbeing if we keep that supervisor-private — decide at build time); (3) consider per-event notification volume/preferences before turning it on broadly. No code is required until then; everything fails safe (silent no-op) in the meantime.

- **Private chat attachments (signed URLs) — known limitation (TEST.md BUG-05).** `/api/chat/upload` stores attachments in Vercel Blob with `access: "public"`, so the file URL is world-readable by anyone who obtains it. Mitigated today by an unguessable filename (`<userId>-<10 random>`), surfacing only inside authz'd channels, and 7-day auto-delete — accepted as a low/moderate, time-boxed risk. Hardening when picked up: store attachments as **private** blobs and mint **short-lived signed URLs** per authorized request (verify channel membership at fetch time), or proxy downloads through an authed route. Touches `chat/upload` + the message-attachment render/fetch path; modest scope. Not urgent given the 7-day TTL.
