# PhDapp — Admin manual

You are the **single admin** account for this PhDapp instance. The admin email is set via the `ADMIN_EMAIL` environment variable; you cannot have more than one admin. This manual covers everything an admin needs:

1. [Roles and responsibilities](#roles-and-responsibilities)
2. [Daily operations](#daily-operations)
3. [The Admin panel](#the-admin-panel)
4. [Architecture at a glance](#architecture-at-a-glance)
5. [The deployment stack](#the-deployment-stack)
   - [GitHub](#github)
   - [Vercel](#vercel)
   - [Neon (Postgres database)](#neon-postgres-database)
   - [Vercel Blob (file uploads)](#vercel-blob-file-uploads)
   - [Google Cloud (OAuth + Calendar + Drive APIs)](#google-cloud-oauth--calendar--drive-apis)
6. [Initial setup recap](#initial-setup-recap)
7. [How a deploy happens](#how-a-deploy-happens)
8. [Environment variables](#environment-variables)
9. [Adding users](#adding-users)
10. [Removing users / off-boarding](#removing-users--off-boarding)
11. [Calendar provisioning](#calendar-provisioning)
12. [Schema migrations](#schema-migrations)
13. [Costs, quotas, and limits](#costs-quotas-and-limits)
14. [Backups](#backups)
15. [Custom domain](#custom-domain)
16. [Performance: the Frankfurt region trick](#performance-the-frankfurt-region-trick)
17. [Troubleshooting](#troubleshooting)
18. [Development workflow](#development-workflow)
19. [When to upgrade](#when-to-upgrade)
20. [Security notes](#security-notes)
21. [References to other files](#references-to-other-files)

---

## Roles and responsibilities

You can do everything any user can do, plus you are the **only** person who can:

- See and edit every student's profile.
- Promote/demote supervisors and admins.
- Run the **Admin panel** (`/admin` route).
- Push code changes (i.e., you own the GitHub repo and the Vercel project).
- Manage env vars on Vercel.
- Manage the Google OAuth test users list.
- Pay for any upgrades (Neon Launch plan, Vercel Pro, custom domain, etc.).

The app assumes one human admin who is also a developer. If you delegate development to someone else, give them the GitHub repo + Vercel collaborator access; keep the Google OAuth client to yourself.

### Feature surfaces added since launch

- **Thesis & publications tracker** (per student profile): `ThesisChapter` + `Publication` tables. Supervisors and the student edit; external advisors/committee read-only. Items can link a Drive file/folder via a picker rooted at the student's shared folder.
- **Private supervisor notes** (per student profile): `SupervisorNote` table. Server-gated by `canSeeSupervisorPrivate(teamLevelForStudent())` — supervisors + admin only; the API returns 404 (not 403) to students/advisors/committee so the feature isn't even discoverable, and the page never sends the data to them. As admin you see and can delete notes on every student.
- New permission helper `teamLevelForStudent()` in `src/lib/access.ts` distinguishes supervisor vs advisor vs committee vs self (the older `accessForStudent()` collapsed them). Use it for any future feature that must treat those roles differently.
- **Undo / soft-delete (Tasks)** — `Ticket.archivedAt` (additive migration). Task DELETE sets `archivedAt` instead of removing; `/api/tickets/[id]/restore` clears it + re-syncs the due event. **All task read queries were audited and filtered** for `archivedAt: null` (tickets list/kanban/dashboard/team/student-profile, incl. relation `_count`). Undo toast on the board (7s). **Server-backed ghost cards**: deletions by others are surfaced from `ticket.delete` activity logs since `kanbanLastSeenAt` → the soft-deleted rows are re-fetched and shown as dashed-red placeholders (`KanbanBoard.initialDeleted`), so they survive reloads until the viewer next opens /kanban; the Tasks sidebar bubble already counts `ticket.delete`. **Scoped to Tasks only** (highest-regret deletion); other models + an automated purge of old archived rows are a tracked follow-up (see IMPROVEMENT_PLAN.md §14) — deliberately not a one-pass app-wide sweep to limit regression risk. To hard-purge: `DELETE FROM "Ticket" WHERE "archivedAt" < now() - interval '30 days'` in Neon.
- **Real notifications** — the 🔔 bell feed is **derived from the `ActivityLog`** (single source of truth), not the sparse `Notification` table. `GET /api/notifications` reads the viewer's `User.notificationsLastSeenAt`, resolves the students they can see (`studentVisibilityWhereAllForAdmin`), then returns the latest 20 `ActivityLog` rows where `studentId ∈ visible | null`, `actorId ≠ viewer`, and `action ∈` a whitelist (ticket/event/reading/availability create·update·delete·propose·decision); `unread` = count of those since `notificationsLastSeenAt`. `notification-bell.tsx` polls it every 30s. `POST {all:true}` advances `notificationsLastSeenAt` (mark-all-read); per-item read isn't tracked — clicking just navigates via `linkFor()`. Best-effort per-event emails still go through `src/lib/notify.ts` + Resend if `RESEND_API_KEY` is set (in-app bell works regardless). Web/browser push deferred. This is the general "bubble number" mechanism for cross-user updates and reliably reflects every change others make.
- **Weekly email digest** — `User.emailDigest` opt-out (Settings → Notifications, non-students). Vercel Cron in `vercel.json` (`0 7 * * 1`, Mon 07:00 UTC) hits `/api/cron/weekly-digest`, which sends per-supervisor summaries via **Resend**. **Requires two Vercel env vars to actually send**: `RESEND_API_KEY` (from resend.com) and `DIGEST_CRON_SECRET` (`openssl rand -base64 32`; Vercel Cron must send it as `Authorization: Bearer …` — set it under the cron's settings, or the route also works if only RESEND is set and you remove the secret check). Optional `DIGEST_FROM` (defaults to Resend's test sender; for real delivery set a verified domain sender). Without `RESEND_API_KEY` the route safely no-ops. Code is shipped; **email won't send until you add those env vars and redeploy.**
- **Annual review export** — print-styled server page `/students/[id]/review?from=&to=` (no migration). Composes thesis/pubs, completed/overdue tasks, meetings+notes, check-in text. **Hard-excludes private supervisor notes and wellbeing scores** (decision §10). Gated by `teamLevelForStudent != null` (advisors/committee read-only; student sees own). User does Cmd+P → Save as PDF. A true server-PDF pipeline is deferred.
- **Structured 1:1 meetings** — `Event.isMeeting/agenda(JSON)/meetingNotes` (additive migration). New-event toggle; `/api/calendar/events/[id]` PATCH accepts agenda/meetingNotes; `/api/calendar/events/[id]/action-items` POST creates `Ticket` rows for the event's student (gated by `canWriteForStudent`, category "meeting", logs ticket.create). Meeting panel in the event dialog.
- **Supervisor team workspace** — `TeamNote` (group-level notes) + `Setting` key/value table (`teamDriveFolderUrl`, admin-set). `/api/team/notes` (+ `/[id]`) and `/api/team/workspace` (GET for supervisors, PUT admin-only). All gated by `isSupervisingUser` → 404 for advisors/committee-only users and students. Rendered as a card at the top of the Team page only when `isSupervisingUser` is true. You (admin) set the shared folder URL via the pencil icon.
- **Supervisor availability** — `Availability` table (userId, startsAt, endsAt, label, kind; additive migration). `/api/availability` (own GET/POST) + `/api/availability/[id]` (own DELETE). The calendar page loads availability for the visible students' supervisors/co-supervisors and **strips `label` for student viewers** (they only get an opaque "Unavailable" block bucketed per day in the month grid). Supervisors manage their own via the "My availability" dialog. Decision §9: students never see the reason. Rendered in **all** views (Month/Year/Week/Day). Creating availability writes an `availability.create` activity-log row per affected student; `/api/calendar/unread` counts that action so the student's Calendar sidebar bubble increments (resets on their next /calendar visit).
- **Recurring events** — `Event.recurrenceRule` stores an iCal RRULE body (`src/lib/recurrence.ts` builds/parses/expands the MVP subset: DAILY/WEEKLY/MONTHLY + INTERVAL + UNTIL). Recurring events are always loaded (their base `startsAt` may predate the window — the calendar query ORs `recurrenceRule != null`) and expanded **client-side** into occurrences over the visible span. The RRULE is pushed to Google so Google owns the real series. **MVP boundary (intentional):** no per-instance exceptions; editing/deleting a series affects all occurrences; "Stop repeating" clears the rule. Additive migration.
- **Weekly check-in** — `CheckIn` table (`@@unique([studentId, weekOf])`, weekOf = Monday 00:00 UTC). Student-only POST upserts the current week via `/api/students/[id]/checkins`; dashboard card for student viewers; read-only history panel on the student profile. `did/blockers/next` are team-readable; **`wellbeing` (1–5) is stripped from API responses and the profile panel for anyone who isn't supervisor-level or the student themselves** (gated by `canSeeSupervisorPrivate`). Additive migration.
- **Reading list** — a top-level **module** (`/reading`, own sidebar entry, visible to all roles): `ReadingItem` table. Students propose (status `proposed`) → supervisors approve/reject; supervisors add auto-approved. Status flow proposed→approved→reading→done (or rejected). `ReadingItem.proposalNote` holds the proposer's "why it's relevant" reason (set at create); `ReadingItem.decisionNote` (+`decisionBy`) holds the supervisor's optional comment on approve/reject (sent with the status PATCH); both render under the item. Per-student API `/api/students/[id]/reading`; the module page aggregates across the viewer's visible students and computes per-student `teamLevelForStudent` to decide who can approve vs propose. Advisors/committee read-only. Unread bubble via `User.readingLastSeenAt` + `reading.create/propose/decision/delete` activity logs counted by `/api/reading/unread` (sidebar, violet, resets on /reading visit) and surfaced in the 🔔 bell (same actions in `/api/notifications` ACTIONS); `ReadingView` polls `/api/reading/list` every 15s for live updates (deletes are hard deletes, so they drop from the polled list within ≤15s). DELETE writes a `reading.delete` log so removals notify the other side like create/decide do.
- **Team Advisor role** — a fourth global `User.role`, `team_advisor`: a senior *internal* member who follows **every** student **read-only** and whose only write is posting to the *Advisor suggestions* thread (distinct from per-student *external advisors*, who are institution-outsiders linked to specific students). **You assign it** via *Edit any user* → Role (or the Admin panel role groups) — **not** via "Add team member" (that flow is per-student-link based; team advisors aren't linked to students). No student can be a team advisor; the cosupervisor endpoint also refuses to add an advisor as a per-student member. Access model: `team_advisor` → `accessForStudent === null` (writes nothing — every write gate requires supervisor/self/admin) and `teamLevelForStudent === "observer"` (a non-null `TeamLevel` so detail/review pages render). Per the user privacy decision they get **full read incl. supervisor-private notes + wellbeing** (`canSeeSupervisorPrivate` accepts `"observer"`; a new `canWriteSupervisorPrivate` keeps note-*writing* supervisor-only). `studentVisibilityWhere*` returns all students for them; they get the Log book. The supervisors' internal *Supervisor team workspace* notes stay supervisor-only. `src/auth.ts` ranks `team_advisor` above student/supervisor so a login with no env-allowlist match can't downgrade a DB-assigned advisor. Hardened two pre-existing `role==="student"`-only deny gates (supervisor-note POST, availability POST) that a non-student would otherwise slip through.
- **Advisor suggestions** — `AdvisorSuggestion` (authorId, body, `studentIds String[]` optional tags, timestamps) + `User.teamSuggestionsLastSeenAt`. `/api/team/suggestions` GET (supervisors+admin+advisors) / POST (advisors+admin only); `/[id]` DELETE (author/admin). A card on the Team page (composer with student-tag chips for advisors; read + delete-own for supervisors). New violet **Team sidebar bubble** via `/api/team/unread` (counts suggestions since `teamSuggestionsLastSeenAt`, cleared on /team visit). Deliberately **not** in the student-visible 🔔 bell (advisor↔supervisor traffic must not leak to students).
- **Workload views** (Team page): two read-only aggregates — *Workload* per supervisor (students supervised/active, open tasks, overdue, assigned to them) and *Student workload* per student (supervisor, status, open, overdue). Both sorted by load. No new tables (pure aggregation over Ticket/Student). Supervisors + admin only (the Team page redirects students).
- All the above are additive Prisma migrations applied automatically on deploy (Workload adds no migration). Roadmap & status: `IMPROVEMENT_PLAN.md`.

## Daily operations

Routine things you do as admin:

| Frequency | Task | Where |
|---|---|---|
| When onboarding a new user | Add their Gmail to Google OAuth test users; if supervisor, also update `SUPERVISOR_EMAILS` env var on Vercel | Google Cloud Console; Vercel Settings |
| When changing what supervisors / admin emails are | Edit env vars `ADMIN_EMAIL`, `SUPERVISOR_EMAILS`, `CO_SUPERVISOR_EMAILS`; redeploy | Vercel Settings |
| Pushing a code change | `git commit && git push` to `main` | Local terminal |
| Investigating a bug | Check Vercel **Logs** for the failing route | Vercel dashboard |
| Watching costs | Vercel Usage + Neon Compute hours + Blob Storage | Each provider's dashboard |

## The Admin panel

`/admin` (also reachable via **Admin** in the sidebar when logged in as the admin email).

What you can do there:

- **Add team member** — invite a new supervisor / external advisor / committee member by Gmail. They need to sign in once before they get a User row; this tool just registers them in advance.
- **Edit any user** — change name, color, role, photo (the admin can edit any user, not just themselves).
- **Maintenance**:
  - **Run chat cleanup now** — manually trigger the 7-day chat-attachment cleanup (otherwise it runs piggybacked on chat uploads, throttled to once per hour).

## Architecture at a glance

```
                   ┌────────────────┐
                   │   GitHub Repo   │
                   │ rafacastrocsic/ │
                   │     phdapp      │
                   └────────┬────────┘
                            │ push to main
                            ▼
                   ┌────────────────┐
                   │     Vercel      │
                   │  (Hobby plan)   │
                   │  Region: fra1   │
                   └──┬─────────┬────┘
                      │         │
                      │         └─────────────┐
                      ▼                       ▼
            ┌─────────────────┐     ┌─────────────────┐
            │ Neon Postgres   │     │  Vercel Blob    │
            │ eu-central-1    │     │  (file storage) │
            │  (database)     │     │                 │
            └─────────────────┘     └─────────────────┘

                            │
                            │ OAuth flow + Google APIs
                            ▼
                   ┌────────────────┐
                   │  Google Cloud  │
                   │   (OAuth 2.0,  │
                   │  Calendar API, │
                   │   Drive API)   │
                   └────────────────┘
```

When a user visits `https://phdapp.vercel.app`:

1. Vercel CDN serves the static assets.
2. For dynamic routes, Vercel spins up a serverless function in Frankfurt (`fra1`).
3. The function reads/writes Neon Postgres (also in Frankfurt — `eu-central-1`) over TLS.
4. File uploads go to Vercel Blob (HTTPS PUT); URLs are stored in Postgres.
5. Auth uses NextAuth → Google OAuth 2.0. Tokens are stored encrypted in Postgres.
6. Calendar sync uses the user's Google access token to call Google Calendar API.
7. Drive features use the same Google API session.

## The deployment stack

### GitHub

- **Repo**: `https://github.com/rafacastrocsic/phdapp`
- **Branch**: `main` is the production branch. Every push to `main` triggers a Vercel deploy.
- **Auth**: connected to Vercel via GitHub OAuth (configured during initial Vercel setup).
- **Secrets**: none stored in GitHub (no Actions). All secrets live in Vercel env vars.

### Vercel

- **Project**: `phdapp` (under your Vercel personal scope).
- **Plan**: Hobby (free).
- **Framework preset**: Next.js (auto-detected).
- **Build command**: `prisma generate && prisma migrate deploy && next build` (set in `package.json`).
- **Output directory**: auto.
- **Function region**: **Frankfurt (`fra1`)** — set in **Settings → Functions → Function Region** to co-locate with Neon. *Not* `iad1` (the Hobby default).
- **Auto-deploys**: on every push to `main`. PRs and other branches get preview URLs but they share the same DB and Blob store (be careful).

### Neon (Postgres database)

- **Project**: `phdapp` on `neon.tech`.
- **Region**: `eu-central-1` (Frankfurt AWS).
- **Plan**: Free tier (auto-pauses after idle).
- **Database name**: `neondb`.
- **Connection string**: pasted into Vercel as `DATABASE_URL`.
- **Schema management**: Prisma. Migrations live in `prisma/migrations/`. New migrations are applied automatically on each Vercel build via `prisma migrate deploy` in the build script.

### Vercel Blob (file uploads)

- **Store name**: `phdapp-uploads`.
- **Access**: public (URLs include a long random suffix, so they're effectively unguessable but not browsable/listable).
- **Used for**: student avatars, user avatars, chat attachments.
- **Env var**: `BLOB_READ_WRITE_TOKEN` (auto-injected by the Vercel integration; visible in **Settings → Environment Variables**).
- **Limits (free tier)**: 1 GB storage, 10 GB bandwidth/month. Plenty for ≤20 users.

### Google Cloud (OAuth + Calendar + Drive APIs)

- **OAuth 2.0 client ID** (`AUTH_GOOGLE_ID`) and **secret** (`AUTH_GOOGLE_SECRET`) — created once in Google Cloud Console → APIs & Services → Credentials.
- **Authorized JavaScript origins**: `http://localhost:3000` (dev) + `https://phdapp.vercel.app` (production) + any custom domain you add.
- **Authorized redirect URIs**: `<origin>/api/auth/callback/google` for each origin.
- **OAuth consent screen**: in **Testing** mode. Only emails on the **Test users** list (max 100) can sign in.
- **Scopes**:
  - `openid`, `email`, `profile` (basic identity)
  - `https://www.googleapis.com/auth/calendar` (read/write Google Calendar)
  - `https://www.googleapis.com/auth/drive.readonly` or `drive.file` (read shared Drive folders)
- **APIs enabled**: People API, Google Calendar API, Google Drive API.

## Initial setup recap

This is the abbreviated form of `DEPLOY.md`. You only do this once (already done at this point — included here as a reference for if you ever rebuild the stack).

1. Switch Prisma datasource from sqlite to postgresql in `prisma/schema.prisma`.
2. Create a Neon project; copy the connection string into `.env` locally.
3. Reset migrations and run `npx prisma migrate dev --name init` against Neon.
4. Install `@vercel/blob` and replace `fs.writeFile`/`unlink` with Blob `put`/`del` in all upload routes.
5. Update `package.json` `build` script to run Prisma generate + migrate deploy + Next build.
6. Push to a private GitHub repo.
7. On Vercel: import the repo, add env vars (`DATABASE_URL`, `AUTH_SECRET`, `AUTH_GOOGLE_ID/SECRET`, `ADMIN_EMAIL`, `SUPERVISOR_EMAILS`, `AUTH_TRUST_HOST=true`), deploy.
8. Connect Vercel Blob via Storage tab → it auto-adds `BLOB_READ_WRITE_TOKEN`.
9. Set the function region to Frankfurt (`fra1`) — important for performance.
10. In Google Cloud Console, add the production URL to the OAuth client's authorized origins + redirect URIs.
11. Add yourself + your students/supervisors to the OAuth test users list.
12. (Optional) Set up a daily Vercel cron for chat-attachment cleanup (`vercel.json` with `crons` and a `/api/cron/cleanup-attachments` route).

## How a deploy happens

```
You: git push origin main
       │
       ▼
GitHub webhook fires → Vercel API
       │
       ▼
Vercel clones the repo at the new commit SHA
       │
       ▼
Vercel runs `npm install`
       │
       ▼
Vercel runs `npm run build`:
   1. prisma generate         → regenerates the Prisma client
   2. prisma migrate deploy   → applies any new migrations to Neon
   3. next build              → builds the Next.js app
       │
       ▼
Vercel deploys the bundle to Frankfurt edge nodes
       │
       ▼
Status flips to Ready; new traffic hits the new deployment immediately
```

Failed builds keep the previous deployment live (no downtime). If you need to roll back manually: **Deployments** tab → click an older Ready deployment → **Promote to Production**.

## Environment variables

Set in **Vercel project → Settings → Environment Variables**. Apply to **Production + Preview** unless noted.

| Name | Purpose | How to obtain |
|---|---|---|
| `DATABASE_URL` | Neon connection string | Neon project dashboard → Connection string |
| `AUTH_SECRET` | Session encryption secret | `openssl rand -base64 32` |
| `AUTH_GOOGLE_ID` | Google OAuth client ID | Google Cloud Console → APIs & Services → Credentials |
| `AUTH_GOOGLE_SECRET` | Google OAuth client secret | Same place; click the client to reveal |
| `AUTH_TRUST_HOST` | NextAuth: trust the deployment host | Literal `true` |
| `ADMIN_EMAIL` | Email of the single admin | Your Gmail |
| `SUPERVISOR_EMAILS` | Comma-separated list of supervisor emails (newly signed-in users from this list get the `supervisor` role) | Manual |
| `CO_SUPERVISOR_EMAILS` | Same idea, for co-supervisors | Manual (optional) |
| `BLOB_READ_WRITE_TOKEN` | Vercel Blob auth | Auto-injected by the Storage integration |
| `CRON_SECRET` | Optional: shared secret to authenticate cron requests | `openssl rand -base64 32` |

**After changing any env var, the next deploy uses it.** Existing deployments do *not* pick up env var changes. Either push a new commit or **Redeploy** the latest from the Deployments tab.

## Adding users

### A new student

1. The student tells you their Gmail address.
2. Add it to **Google OAuth test users** (Google Cloud Console → OAuth consent screen → Audience → Test users → Add).
3. In PhDapp:
   - Go to **Students** → **New student** dialog.
   - Fill in their name, email, year, color, etc.
4. Tell the student to sign in. The first time they log in, their User row is created and linked to the Student row via email.
5. As primary supervisor (or admin), open their profile → **Share Drive** to create a shared Drive folder; → **Sync calendar** to set up the shared Google Calendar.

### A new supervisor / co-supervisor / committee member

1. Add their Gmail to the OAuth test users list (same step as above).
2. If they're a primary supervisor of new students, add them to the `SUPERVISOR_EMAILS` env var on Vercel (comma-separated). Then redeploy so the env change takes effect.
3. Tell them to sign in once — that creates their User row.
4. Open the relevant student's profile → **Manage team** → add them by email with the right role.

### A new team advisor

A *team advisor* is a senior internal colleague who should be able to follow **all** students and send suggestions to the supervisors, but never change anything.

1. Add their Gmail to the OAuth test users list (same as above).
2. Tell them to sign in once — that creates their User row (they'll come in as a plain student until you change it).
3. Go to **Team** → open their card → **Edit** (or the **Admin panel**) → set **Role = Team advisor**. (Do **not** use *Add team member* / *Manage team* — that's only for per-student supervisors/external-advisors/committee.)
4. That's it — they immediately see every student (read-only, including private notes and wellbeing), the Log book, and the **Advisor suggestions** thread on the Team page where they post suggestions to the supervisors.

## Removing users / off-boarding

There's no UI "delete user" button. To off-board:

1. Reassign their students (open each affected student → **Manage team** → remove them).
2. Remove their email from `SUPERVISOR_EMAILS` / `CO_SUPERVISOR_EMAILS` env vars if listed.
3. Remove their email from the Google OAuth test users list.
4. (Optional, irreversible) Delete the User row directly in Neon: `DELETE FROM "User" WHERE email = '...'`. This cascades to sessions, comments, and team links. Prefer leaving the row in place so their old tasks/comments still show their name.

## Calendar provisioning

When you (a supervisor) open a student's profile and click **Share Drive** or **Share calendar**:

- The app calls the Google Calendar API using your own access token.
- A new shared calendar is created in *your* Google account, named `{student alias} · PhD supervision`.
- ACL writer access is granted to the student + every team member with an email.
- The calendar ID is saved on the Student row (`calendarId` column).
- Future events created in PhDapp with **Push to Google Calendar** checked land on this calendar.

If sharing fails (e.g., a user's email is invalid), the system logs a warning but continues. You can re-run the ACL sync from the student profile's **Sync calendar** button to retry.

**Important**: the calendar is owned by *your* Google account. If you leave the institution, ownership needs to be transferred (manual operation in Google Calendar settings, per student).

## Schema migrations

The DB schema is defined in `prisma/schema.prisma`. To change it:

1. Edit the schema file locally.
2. Run `npx prisma migrate dev --name <descriptive_name>`. This:
   - Generates a new SQL migration file under `prisma/migrations/`.
   - Applies it to your local Neon DB.
3. Commit the migration file + schema change.
4. Push. Vercel's build will run `prisma migrate deploy` automatically, applying the migration to production Neon.

**Don't forget**: commit the migration file. If only the schema changes and not the migration, Vercel build will fail on `migrate deploy`.

If Prisma complains about non-interactive environment (it does, by design, for AI agents and CI), use:

- `npx prisma migrate diff --from-schema-datamodel <prev> --to-schema-datamodel prisma/schema.prisma --script > migration.sql` to generate the SQL manually.
- Place it in `prisma/migrations/<timestamp>_<name>/migration.sql`.
- Apply with `npx prisma migrate deploy`.

## Costs, quotas, and limits

**Currently free** at ≤20 users. Watch these:

- **Vercel Hobby**: bandwidth + function execution time. Free tier is generous; you're nowhere near it.
- **Neon Free**: 191 hours/month of *active* compute (auto-pauses when idle, so this is hard to exhaust). 0.5 GB storage.
- **Vercel Blob Free**: 1 GB storage, 10 GB bandwidth/month.
- **Google Cloud**: OAuth + Calendar + Drive APIs are free under reasonable use; only watched if you hit rate limits.

If you outgrow free tiers:

- **Neon Launch** $19/mo — more compute and disable auto-suspend.
- **Vercel Pro** $20/mo — needed if you want commercial use, faster builds, or multi-region.
- **Custom domain** ~$10–15/year — for branding, e.g. `phdapp.yourgroup.org`.

## Backups

- **Neon** automatically retains 7 days of point-in-time recovery on the free tier. You can browse history in the Neon dashboard → Project → Branches.
- **Vercel Blob** does *not* have automatic backups. To back up uploads, you'd need a separate script. For ≤20 users with mostly avatars + chat attachments, this is low-risk. If it matters, write a small cron that mirrors blobs to S3/another provider.
- **Source code** is in GitHub.

To restore Neon to a point in time: Neon dashboard → Branches → Create branch from history → pick a timestamp → either swap the branch as the primary or copy data out manually.

## Custom domain

If you want `phdapp.yourgroup.org` instead of `phdapp.vercel.app`:

1. Buy a domain (~$10–15/yr, Namecheap, Cloudflare Registrar, etc.).
2. Vercel project → **Settings → Domains** → add the domain. Vercel shows the DNS records to set at your registrar.
3. Set the DNS records and wait for them to propagate (5 min – 24 h).
4. **Repeat the Google OAuth setup** (Step 9 in DEPLOY.md) with the new domain in Authorized origins + redirect URIs.
5. Optionally redirect the `vercel.app` URL to the custom domain (Vercel does this automatically when you mark the custom domain as primary).

## Performance: the Frankfurt region trick

The single biggest performance lever discovered during deployment: the Vercel Hobby plan defaults functions to `iad1` (Washington DC, US East), but your Neon DB is in `eu-central-1` (Frankfurt). Each DB query was crossing the Atlantic, adding ~120 ms per query — and there are 3–5 queries per page nav.

Fix: **Vercel project → Settings → Functions → Function Region → Frankfurt (`fra1`)**. Save. Vercel automatically redeploys. Subsequent navs drop from 1–2 s to 200–400 ms.

Why this matters going forward: if you ever migrate Neon to another region, also update the Vercel function region. Same continent is enough; same AWS region is best.

## Troubleshooting

| Symptom | Cause | Fix |
|---|---|---|
| Build fails with `P1001` (can't reach DB) | Neon paused (free tier scales to zero) | Open Neon dashboard once — it wakes up. |
| Sign-in: "Access blocked" / *"Acceso bloqueado: ... no ha completado el proceso de verificación de Google"* | User isn't on the OAuth test users list | Add their Gmail in Google Cloud Console → OAuth consent → Test users. |
| Sign-in: "this app is still being tested" warning | Normal for Testing-mode OAuth | Tell user to click **Continue / Continuar**. Not fixable without OAuth verification (2–6 week Google review). |
| Image upload returns 500 with `Vercel Blob: No token found` | `BLOB_READ_WRITE_TOKEN` not in the running deployment | Verify env var exists; **Redeploy** the latest. |
| `Untrusted Host` error in Vercel logs | `AUTH_TRUST_HOST` env var missing | Set it to `true` and redeploy. |
| Calendar event push fails with 403 | Owner of student's shared calendar didn't grant the requester writer access | Open student profile → **Sync calendar**. Or have the calendar owner re-share. |
| Polling refresh stops on the kanban/calendar | Browser tab is backgrounded or a dialog is open | Click into the window, close dialogs — polling resumes. |
| Pages slow (1–2 s per nav) | Function region not pinned to fra1 | See [Frankfurt region trick](#performance-the-frankfurt-region-trick). |
| Cron never runs | Path in `vercel.json` doesn't match a real route, or `CRON_SECRET` mismatch | Check the route exists at exactly that path; check the header check inside it. |

## Development workflow

For day-to-day changes:

1. **Local**: `npm run dev` runs against your local `.env` (which points at Neon).
2. **Test locally**: Sign in, click around, verify your change.
3. **Type-check**: `npx tsc --noEmit` should be clean.
4. **Commit**: `git commit -m "..."` with a clear message.
5. **Push**: `git push` → Vercel deploys automatically.
6. **Watch the deploy**: Vercel dashboard → Deployments → wait for green.
7. **Verify**: open the production URL and confirm.

If the deploy fails:

- Open the failing deployment → **Build logs** at the top.
- Common: type errors in code, missing env var, Prisma migration mismatch.
- Fix locally → push another commit. Don't try to "fix" the failed deploy in place — push a new commit.

**Schema changes need extra care**: see [Schema migrations](#schema-migrations) above.

## When to upgrade

- **Need >100 OAuth users** → submit the OAuth consent screen for verification (2–6 weeks, Google review). See `DEPLOY.md` "When to consider upgrading" section.
- **Neon compute exhausted** ("compute hours" near 191/month) → Neon Launch plan ($19/mo) and disable auto-suspend.
- **Vercel commercial-use concern** (Hobby is non-commercial) → Vercel Pro ($20/mo per user).
- **Bigger team, multiple admins** → would require schema changes (currently `ADMIN_EMAIL` is a single string).
- **Real-time collab beyond polling** → would need WebSockets/Pusher/Ably + reworking the data layer. Not currently in scope.

## Security notes

- **Secrets**:
  - `AUTH_SECRET` rotation breaks all active sessions (everyone logs out). Set once, leave alone unless compromised.
  - `AUTH_GOOGLE_SECRET` rotation requires updating Vercel env vars and redeploying; no user-visible impact.
  - Don't commit `.env` to git (it's gitignored, but double-check).
- **OAuth scopes**: the app requests Calendar + Drive scopes. Users are shown this on sign-in. If you remove or add a scope, existing users must re-consent.
- **Database access**: Neon connection string in `DATABASE_URL` grants full read/write access. Treat as a top-tier secret. Rotate from the Neon dashboard if leaked.
- **Vercel Blob URLs are public** (anyone with the URL can read). Don't store anything sensitive there. The long random suffix in URLs makes them effectively unguessable but not private.
- **Activity log retention**: indefinite. If a user requests deletion of their activity (GDPR / DSAR), you'd need to manually delete their `ActivityLog` rows.

## References to other files

- `DEPLOY.md` — original step-by-step deploy guide (the source of truth for the *initial* setup).
- `README.md` — short project overview, dev quick-start.
- `prisma/schema.prisma` — DB schema. Edit here, then migrate.
- `package.json` — `build` script, dependencies.
- `vercel.json` — `regions` config (Frankfurt). Note: function region is enforced by the Vercel dashboard setting, not this file.
- `.env.example` — template for new local environments.
- `IMPROVEMENTS.md` — running list of polish/follow-up ideas.

For any deeper question — pull up the relevant file. The codebase is small enough to read end-to-end if needed.
