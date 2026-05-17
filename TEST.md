# PhDapp — Debug & Test Plan

A full-coverage manual + automated test plan: every role, every module, every
cross-cutting concern. Use the checkboxes; log every failure with the template
in **§9** so it can be triaged into a fix list.

- [1. How to use this](#1-how-to-use-this)
- [2. The auth reality (read first)](#2-the-auth-reality-read-first)
- [3. Test accounts & roles matrix](#3-test-accounts--roles-matrix)
- [4. Static & automated checks](#4-static--automated-checks)
- [5. Functional plan by module](#5-functional-plan-by-module)
- [6. Cross-cutting](#6-cross-cutting)
- [7. Security / access-control matrix](#7-security--access-control-matrix)
- [8. Regression checklist (this dev cycle)](#8-regression-checklist-this-dev-cycle)
- [9. Bug log & triage template](#9-bug-log--triage-template)
- [10. What I need from you to run this](#10-what-i-need-from-you-to-run-this)

---

## 1. How to use this

Two passes:

1. **Static pass** (§4) — no accounts needed, run locally in bash now. Catches
   type errors, lint, dead routes, missing authz patterns, build breakage.
2. **Functional pass** (§5–§7) — needs real sign-ins. For each item: do the
   steps, compare to **Expected**, tick or log a bug (§9).

Severity: **S1** data loss / security / can't use a core flow · **S2** feature
broken, workaround exists · **S3** cosmetic / edge · **S4** nice-to-have.

---

## 2. The auth reality (read first)

- Sign-in is **Google OAuth only** — there is no email/password path. A user
  can only sign in if their Gmail is on the Google OAuth **test users** list.
- Global role comes from env allowlists (`ADMIN_EMAIL`, `SUPERVISOR_EMAILS`,
  `CO_SUPERVISOR_EMAILS`) which can only **promote**, plus DB role set via the
  admin panel. Per-student roles (supervisor / team_advisor / external_advisor
  / committee) are `CoSupervisor` rows set in **Manage team** / **Add team
  member**.
- The `prisma/seed.ts` `@phdapp.local` users **cannot sign in** (not real
  Google accounts). Seed data is only useful against a local DB for
  read-shape testing, not for live UI auth.
- Consequence: black-box UI testing of all roles needs **real Google test
  accounts**, one per role. See §10.

---

## 3. Test accounts & roles matrix

You need these distinct sign-ins. "Global" = `User.role`; "Per-student" =
`CoSupervisor.role` on a specific test student.

| # | Account | Global role | Per-student setup | Purpose |
|---|---------|-------------|-------------------|---------|
| A | admin | `admin` (ADMIN_EMAIL) | n/a | Full access, Admin panel |
| B | primary supervisor | `supervisor` | primary of **S1**, **S2** | Owns students |
| C | co-supervisor | `supervisor` | `supervisor` co-row on **S1** | Shared write |
| D | team advisor | `supervisor` globally | `team_advisor` on **S1** only; **also** primary supervisor of **S3** | Proves per-student split: read-only on S1, write on S3 |
| E | external advisor | `supervisor` globally | `external_advisor` on **S2** | Outsider, read-only-ish |
| F | committee | `supervisor` globally | `committee` on **S2** | Committee, read-only |
| G | student S1 | `student` | is **S1** | Own data only |
| H | student S2 | `student` | is **S2** | Isolation checks |

Test students to create: **S1** (team A primary, C co-sup, D team-advisor,
account G), **S2** (B primary, E external, F committee, account H), **S3**
(D primary — proves D writes here but only reads S1).

---

## 4. Static & automated checks

Run from repo root. These I can do in bash with **no credentials** (except
where a DB URL is noted). Record pass/fail + output.

```bash
# 4.1 Type safety — must be clean
npx tsc --noEmit

# 4.2 Lint
npm run lint

# 4.3 Prisma schema valid + migrations in sync with the DB
npx prisma validate
npx prisma migrate status            # needs DATABASE_URL (read-only check)

# 4.4 Production build (⚠ runs `prisma migrate deploy` against DATABASE_URL —
#     only run when DATABASE_URL points at a THROWAWAY/TEST db, never prod)
npm run build

# 4.5 Route inventory sanity — every route file exports a handler
grep -RL "export async function\|export const \(GET\|POST\)" src/app/api --include=route.ts
```

- [ ] 4.1 `tsc` clean
- [ ] 4.2 `lint` clean (or only known warnings)
- [ ] 4.3 `prisma validate` ok; `migrate status` = up to date
- [ ] 4.4 `build` succeeds (test DB only)
- [ ] 4.5 no route file missing a handler

**Code-audit checks (I can do these now, no accounts):** for every route in
`src/app/api/**`, confirm it (a) calls `auth()` and 401s when unauthenticated,
(b) gates writes via `accessForStudent`+`canWriteForStudent` or
`teamLevelForStudent`/role checks, (c) never trusts client-supplied
`studentId`/`role` without a visibility check, (d) validates body with zod.
Output: a table of route → authz mechanism → gap (if any).

---

## 5. Functional plan by module

For each: **Pre** (state needed) · **Steps** · **Expected** · **Edge/negative**.
Run the golden path as the "natural" role, then repeat the *negative* rows as
the wrong role.

### 5.1 Auth & onboarding
- [ ] New Google account NOT on test list → "Access blocked" handled gracefully.
- [ ] First sign-in of an email in `SUPERVISOR_EMAILS` → role `supervisor`.
- [ ] Admin-set DB role is NOT downgraded on next login (rank guard).
- [ ] Sign out → protected pages redirect to `/signin`.
- [ ] Student account auto-links to its `Student` row by email.

### 5.2 Dashboard (`/`)
- [ ] Each role: cards render, counts match reality, links work.
- [ ] Student sees weekly check-in card; supervisor sees portfolio summary.
- [ ] Edge: brand-new account with zero data → no crashes, sensible empties.

### 5.3 Students (`/students`, `/students/[id]`)
- [ ] B sees only their students; A sees all; G sees only self; D sees S1 (advised) + S3.
- [ ] New student (A/primary only) — created, calendar/drive provisioning prompts.
- [ ] Edit profile (primary/admin); E/F/D-on-S1 see **no edit controls**.
- [ ] Profile header renders (avatar, status, links) — **resize window narrow→wide, no breakage** (regression: header was reverted to single-row).
- [ ] Thesis chapters: add/reorder/status (supervisor & student); advisor read-only.
- [ ] Publications: add/edit/status/Drive link.
- [ ] Private supervisor notes: visible to A/B/C **and D (team advisor of S1)**; **hidden (404) to E/F/G**. D can **read but NOT create** a note.
- [ ] Wellbeing score on profile: visible to A/B/C/D; hidden from E/F; visible to the student themselves.
- [ ] Delete student (primary/admin only) — confirm + cascade.
- [ ] Negative: G opens `/students/<S2 id>` → 404/redirect (isolation).

### 5.4 Tasks / Kanban (`/kanban`)
- [ ] Create task (New task) — supervisor & student-for-self; D **cannot** create for S1, **can** for S3.
- [ ] Drag across columns; status persists; reload stable.
- [ ] Priority/category (incl. "Other" custom), due date.
- [ ] **Subtasks**: add/rename/tick/remove.
- [ ] **Subtask deadline** (recent feature): set a date; appears.
- [ ] Subtask deadline **after** task deadline → inline red error, NOT saved (client) AND server 400 if forced.
- [ ] Lower the task deadline below an existing subtask's → same error path.
- [ ] Subtask **with** a deadline → shows on Calendar as `[Sub-task] <text> · <task>`; subtask **without** one → not on calendar.
- [ ] Comments thread; history tab.
- [ ] Delete task → soft-delete + **Undo toast** restores it (incl. its calendar mirror & subtask events).
- [ ] Negative: external advisor/committee task create/delete per the cheat sheet (§7).

### 5.5 Calendar (`/calendar`)
- [ ] Month/Week/Day/Year views render; current-time line.
- [ ] Create **assigned** event (writer roles) — shows for student + team.
- [ ] Create **unassigned/general** event (supervisor/admin) — **does NOT show as a struck-through "deleted" ghost**; survives reload; visible to all roles (regression).
- [ ] Task due date → `[Task]` chip; click → jumps to task.
- [ ] Recurring event (daily/weekly/monthly + until) expands correctly; "Stop repeating" clears.
- [ ] 1:1 meeting: agenda (pre), notes (blur-save), **action items → tasks** with per-item deadline/priority/category; "Open Task panel" message.
- [ ] Availability ("My availability") supervisor-only; student sees opaque "Unavailable" block, no reason, all views; Calendar bubble increments.
- [ ] Google sync (if linked): event create/patch/delete mirrors; subtask events are **in-app only** (NOT in Google).
- [ ] Negative: student creating an event only gets their own studentId.

### 5.6 Chat (`/chat`)
- [ ] Channels list; unread bold + pink dot; open clears.
- [ ] Send message (Enter); attach file ≤25 MB; 7-day auto-delete note.
- [ ] Membership: G sees only own channels; E/F per their student.
- [ ] Cleanup cron route behaves (old attachments).

### 5.7 Files (`/files`)
- [ ] Lists the student's shared Drive folder; open in Drive (new tab).
- [ ] Star/unstar; starred float to top.
- [ ] Role scoping: G only own; B their students.

### 5.8 Reading (`/reading`)
- [ ] Supervisor adds (auto-approved); student proposes (pending).
- [ ] Propose with a "why relevant" note; supervisor sees it.
- [ ] Approve/Reject with a decision comment; both notes render under item.
- [ ] Remove a reading → Reading sidebar bubble + 🔔 bell update for the other side; list auto-refreshes (≤15 s).
- [ ] Advisor/committee read-only; student can't approve own proposal.

### 5.9 Reading/Team/Calendar bubbles & 🔔 bell
- [ ] Cross-user change (B edits S1 task) → G sees Tasks bubble; bell lists it; "Mark all read" clears via lastSeen.
- [ ] Bell never shows your **own** actions; only students you can see.
- [ ] Advisor suggestion posted → supervisors get **Team** sidebar bubble; **NOT** in the student bell.

### 5.10 Team (`/team`)
- [ ] Unified **Team members** list: each member shows *Supervisor of / Team advisor of / External advisor of / Committee for* with **student names**. Verify D shows "Supervisor of: S3" **and** "Team advisor of: S1".
- [ ] Admin sees all student names; non-admin supervisor sees only names in their visibility ("+N more" otherwise).
- [ ] Supervisor team workspace (notes + Drive link) — supervisors/admin only; **D (team-advisor-only on S1) does NOT see it**.
- [ ] **Advisor suggestions** card: D can post (tag 0/1/many students or general); B/A read + delete; D can delete own.
- [ ] Workload tables compute correctly.
- [ ] Manage team dialog: add/remove/promote; role picker includes **Team advisor**; can't add a student; can't add a team-advisor as if global.
- [ ] Students redirected away from `/team`.

### 5.11 Log book (`/log`)
- [ ] Student sees own actions; supervisor sees their students'; admin all.
- [ ] team-advisor-only / external / committee → redirected (no Log book), consistent.
- [ ] Filters by student/actor; export route works (admin).

### 5.12 Annual review (`/students/[id]/review`)
- [ ] Header shows full **student details** block (name, email, year, status, start/expected-end, research area, ORCID, supervisor, period).
- [ ] Sections: thesis, pubs, completed/overdue tasks, meetings+notes, check-in text.
- [ ] **Wellbeing & private notes excluded.**
- [ ] **Print (Cmd+P / Save as PDF): sidebar + top bar hidden, content flows multi-page, no clipping.** Test at A4.
- [ ] `?from=&to=` overrides the period.
- [ ] Advisor/committee can view read-only; null relation → 404.

### 5.13 Search (top bar, recent)
- [ ] Type ≥2 chars → debounced dropdown with Students/Tasks/Events groups.
- [ ] Click result navigates (student profile / kanban?ticket / calendar).
- [ ] Results respect visibility: G search returns only own; B only their students; A all.
- [ ] No matches → "No matches" message; <2 chars → nothing; Escape/outside-click closes.

### 5.14 Settings (`/settings`)
- [ ] Profile edit (name/color/photo) all roles; role dropdown admin-only.
- [ ] Weekly-digest opt-out toggle (non-students) persists.

### 5.15 Admin panel (`/admin`)
- [ ] Non-admin → redirect.
- [ ] Role groups list (admin/supervisor/student); change a user's role.
- [ ] Add team member (incl. **Team advisor** requiring a student); maintenance tools.

---

## 6. Cross-cutting

- [ ] **Soft-delete/Undo**: deleting Task hides it everywhere (board, dashboard counts, workload, calendar); Undo fully restores; ghost placeholder for others; hard-purge job (if any) only old rows.
- [ ] **Real-time**: bubbles/poll endpoints (`/api/*/unread`, list polls) update within their interval; lastSeen resets on visit.
- [ ] **Email digest**: confirm it is **dormant** (no send) without `RESEND_API_KEY`; `/api/cron/weekly-digest` returns `{skipped}`; recipient query excludes team-advised students (code-audit).
- [ ] **Calendar ↔ Google**: link account; create/edit/delete event & task-due; verify Google mirror; unlink → app still works (local-only, warning shown).
- [ ] **Responsive**: each main page at 360 / 768 / 1024 / 1440 widths — sidebars collapse, no overflow, header OK.
- [ ] **Print** any page → app chrome hidden (global `print:` rules).
- [ ] **Error/empty states**: brand-new tenant, no students, no tasks, no Google linked — no crashes.
- [ ] **Concurrency**: two roles editing the same task/event; last-write + activity log sane.

---

## 7. Security / access-control matrix

The highest-value pass. For each cell do the action **as that role** and
confirm **allow (✓)** or **blocked with 403/404, no data leak (✗)**. Test the
✗ cells by calling the API directly too (not just hidden UI).

| Action (on student S1) | A admin | B primary | C co-sup | D team-advisor(S1) | E ext-adv | F committee | G student S1 | H student S2 |
|---|---|---|---|---|---|---|---|---|
| View S1 profile | ✓ | ✓ | ✓ | ✓ | ✗ | ✗ | ✓(self) | ✗ |
| See S1 private notes / wellbeing | ✓ | ✓ | ✓ | ✓ (read) | ✗ | ✗ | ✓ wellbeing(self) | ✗ |
| Create S1 private note | ✓ | ✓ | ✓ | ✗ | ✗ | ✗ | ✗ | ✗ |
| Create/edit/delete S1 task | ✓ | ✓ | ✓ | ✗ | ✓* | ✓* | ✓(self) | ✗ |
| Create S1 event | ✓ | ✓ | ✓ | ✗ | ✓* | ✓* | self only | ✗ |
| Manage S1 team | ✓ | ✓ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ |
| Post advisor suggestion | ✓ | ✗ | ✗ | ✓ | ✗ | ✗ | ✗ | ✗ |
| See supervisor team workspace | ✓ | ✓ | ✓ | ✗ | ✗ | ✗ | ✗ | ✗ |
| Read S1 in global search | ✓ | ✓ | ✓ | ✓ | ✗ | ✗ | ✓(self) | ✗ |
| Open `/admin` | ✓ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ |

`*` external_advisor/committee currently get write via the coarse
`accessForStudent` (documented existing behaviour) — **verify it matches the
permissions cheat sheet in the supervisor manual; flag if not intended.**

Direct-API negative tests (run as the wrong role with a copied session cookie):
- [ ] `PATCH /api/tickets/<S1 task>` as D → 403.
- [ ] `POST /api/students/<S1>/notes` as D → 404 (write gate), but `GET` → 200.
- [ ] `POST /api/team/suggestions` as B → 403.
- [ ] `GET /api/students/<S2>/checkins` as G → wellbeing stripped / 404.
- [ ] `POST /api/users/<x>` role change as B → 403.
- [ ] Forge `studentId` in `POST /api/tickets` to a non-visible student → 403.

---

## 8. Regression checklist (this dev cycle)

Re-verify the things changed recently — most likely to have fresh bugs:

- [ ] Team advisor = **per-student** (D writes S3, read-only S1); not a global role anymore.
- [ ] Team page unified members list with names + both-hats case (D).
- [ ] Advisor suggestions thread + Team bubble; not in student bell.
- [ ] Unassigned calendar events no longer ghost as "deleted".
- [ ] 1:1 action items take deadline/priority/category.
- [ ] Subtask deadlines: validation both directions + calendar mirror, in-app only.
- [ ] Annual review: student-details header + clean multi-page print.
- [ ] Student-profile header reverted to single-row (no `lg:` split).
- [ ] Global search works and is visibility-scoped.
- [ ] Email digest dormant; docs say "not active yet"; FUTURE item present.
- [ ] Manuals: Team Advisor explained in all 3 + in TOCs.

---

## 9. Bug log & triage template

Append findings here (or a sheet). One block per bug:

```
### BUG-NN — <one-line title>
- Severity: S1|S2|S3|S4
- Role: <which account>
- Where: <page/route>
- Steps: 1… 2… 3…
- Expected: …
- Actual: …
- Evidence: <screenshot / response body / console / network>
- Suspected cause: <file:line if known>
- Proposed fix: <approach>
- Status: open | fixing | fixed (<commit>) | wontfix
```

Triage flow: collect all → I group by subsystem → produce a **solution plan**
(ordered fix list with risk/scope) → fix highest-severity first, type-check +
re-test each, commit per logical fix.

---

## 10. What I need from you to run this

I work in bash in this repo. Pick a mode (they stack):

### Mode A — Static + code audit (I can start NOW, need nothing)
I run §4 commands + a full per-route authz/code audit and report a bug/risk
list with file:line and a fix plan. Catches type/lint/build breakage, missing
auth gates, visibility leaks, zod gaps, obvious logic bugs. **No accounts, no
DB writes.** Only ask: confirm whether `DATABASE_URL` in `.env` points at
**prod** (then I'll skip `migrate status`/`build` against it) or a safe DB.

### Mode B — Local runtime + scripted API tests (most bug-finding power)
To exercise routes for real I need:
1. A **non-production Postgres** URL (a free Neon branch / throwaway db) I can
   put in `.env.test`, so `db:reset`+`db:seed` and writes are safe.
2. A way to **bypass Google for automated requests** — easiest: you let me add
   a **dev-only credentials/login route guarded by an env flag** (e.g.
   `TEST_LOGIN_SECRET`, disabled in prod) so I can mint a session per role and
   curl every endpoint as A–H. (I'll write it + delete/guard it after.)
   *Alternative:* paste valid `__Secure-authjs.session-token` cookies for one
   account of each role from your browser (they expire, less repeatable).
3. Confirm I may run `npm run dev` locally and hit `http://localhost:3000`.

With B I produce real request/response evidence and a concrete fix PR list.

### Mode C — Live black-box on the deployed app
Needs **real Google test accounts** (one per role per §3, added to the OAuth
test-users list and pre-seeded with the right env/DB roles + the S1/S2/S3
team setup), and you running the click-throughs (I can't drive your browser
here) OR enabling the Chrome extension / a preview tool so I can. You feed me
results against §5–§7; I triage + fix.

**My recommendation:** start **Mode A immediately** (free, finds real bugs
fast), and set up **Mode B** (one throwaway Neon branch + a guarded test-login
route) for the deep functional/security pass — that gives the best
bug-yield-per-effort. Mode C only for final UAT.

Tell me: (1) is `.env` `DATABASE_URL` prod? (2) which mode(s) to proceed with?
For Mode A just say "go" and I'll start the audit.

---

## 11. Mode A findings — static + authz audit (2026-05-17)

### Static
- `tsc --noEmit`: **clean** ✓
- `prisma validate`: **valid** ✓ · `migrate status`: prod **schema up to date** (20 migrations) ✓
- `eslint`: **11 errors + 2 warnings**, all `react-hooks/set-state-in-effect` /
  exhaustive-deps. **Not deploy-blocking** (Next 16 doesn't fail build on these;
  deploys succeed, tsc clean). S3 code-debt. 3 in this cycle's files
  (`global-search.tsx:26`, `kanban-board.tsx:876`, `manage-team-dialog.tsx:69`),
  rest pre-existing. Prisma 6→7 major upgrade available (S4, informational).

### BUG-01 — S1 — Team advisor can hijack a student's team — FIXED
- Where: `src/app/api/students/[id]/cosupervisors/[userId]/route.ts` DELETE & PATCH
- The non-admin ownership check used `coSupervisors.some({ userId })` **without**
  `role != "team_advisor"`. A team advisor (read-only by design) of a student
  could DELETE that student's supervisors or PATCH-promote **themselves** to
  primary supervisor (full write). The sibling `../route.ts` `loadOwned` got the
  exclusion in the per-student rework; this sub-route was missed.
- Fix: added `role: { not: "team_advisor" }` to both clauses. tsc clean.
  Status: **fixed (this commit)**.

### BUG-02 — S2 — Team advisor not excluded from a student's private chat — FIXED (read-only enforced)
- Where: `channels/[id]/messages/route.ts:15`, `channels/route.ts:30`,
  `lib/chat-access.ts:15` — all match `coSupervisors.some({ userId })` with no
  role filter, so a team advisor can **read & post** in the student's 1:1
  channel and create channels about them.
- Conflict: supervisor-manual cheat sheet says chat = "–" for team advisor and
  the role is "read-only".
- Resolved: option **(a)** — `role: { not: "team_advisor" }` added to
  `chat-access.ts`, `chat/page.tsx`, `channels/[id]/messages` authorize, and
  `channels` create link-check; the chat page's student set now excludes
  team-advised students. A team advisor still sees a channel only if explicitly
  added as a member. **Status: fixed.**

### BUG-03 — S2 — Unrestricted channel creation + arbitrary membership — FIXED
- Where: `src/app/api/channels/route.ts` POST.
- Was: with no `studentId`, no gate — any user (incl. students) could create a
  channel with arbitrary `kind` (notably `general`, which everyone can
  read/post) and arbitrary `memberIds`.
- Fix (verified against the chat UI's `NewChannelDialog` payload so supervisor/
  co-sup/admin flows still work): `kind` constrained to a zod enum; for
  **non-students** `kind:"general"` requires `isSupervisingUser || admin` and
  the studentId link-check excludes `team_advisor`. **Students CAN create a
  channel** (per product decision) but only **about themselves** and only with
  **their own supervisors** (primary + `co_supervisor`) — never `general`,
  never with team/external/committee advisors or other students; server forces
  `studentId = self`, validates every requested member ∈ {their supervisors}
  (else 403). UI: the member picker for a student is scoped to just their
  supervisors and the kind/linked-student fields are hidden. **Status: fixed.**

### BUG-04 — S3 — Advisors/committee/team-advisor can post task comments — ACCEPTED (by design, documented)
- Where: `src/app/api/tickets/[id]/comments/route.ts` POST — gated by
  *visibility* only (`studentVisibilityWhereAllForAdmin`), not write access.
- **Decision: accept.** Comments are *communication*, not task mutation —
  anyone who can see the student may comment. The strict "read-only" wording
  for team advisor refers to data they cannot change (tasks/events/profile);
  posting a comment is allowed for advisors/committee/team-advisor. Documented
  in the manuals (cheat-sheet note). No code change. **Status: closed.**

### BUG-05 — S3 — Chat attachments are world-readable Blob URLs — ACCEPTED (known limitation, FUTURE)
- Where: `src/app/api/chat/upload/route.ts:59` `access: "public"`.
- **Decision: accept** as a documented known limitation (unguessable name +
  7-day auto-delete; only surfaced inside authz'd channels). Hardening
  (private blobs + short-lived signed URLs) logged as an **IMPROVEMENT_PLAN
  FUTURE** item. No code change now. **Status: closed (deferred).**

### Audited clean (no issue)
`/log` DELETE & `/log/export` (admin-only) · `/chat/cleanup` (admin-only) ·
`/availability` + `/availability/[id]` (own-scoped) · `/drive/list` &
`/calendar/list` (caller's own Google token = Google ACL boundary) ·
`/students` POST (supervisor/admin) · `/students/[id]/*` (accessForStudent /
teamLevel; notes POST uses `canWriteSupervisorPrivate`) · `/team/*` (workspace &
suggestions gated; suggestions = `isTeamAdvisorAnywhere`) · `/search` (visibility
-scoped) · `/tickets/[id]` (accessForStudent+canWriteForStudent) ·
`/channels/[id]` PATCH/DELETE (member/admin; DELETE blocks students) · server
pages `students/[id]` & `review` (spot-checked: visibility for the record,
accessForStudent/teamLevel for controls — correct).

### Fix order
1. **BUG-01** — done (S1).
2. **BUG-03** — restrict channel creation (S2; verify chat UI first).
3. **BUG-02** — apply option (a) or (b) once you decide (S2).
4. **BUG-04 / BUG-05** — your call (S3).
5. lint debt + Prisma 7 — opportunistic (S3/S4).

### Status — all Mode A items resolved
- BUG-01 fixed (S1) · BUG-02 fixed read-only (S2) · BUG-03 fixed, students may
  channel **only their own supervisors** (S2) · BUG-04 accepted+documented (S3)
  · BUG-05 accepted, FUTURE hardening logged (S3) · lint/Prisma-7 = S3/S4 debt.
- Next: **Mode B** (Neon branch + a prod-disabled test-login route) for the
  runtime + direct-API negative pass — pending your go-ahead.
