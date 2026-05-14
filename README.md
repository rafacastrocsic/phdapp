# PhDapp — Supervision Hub

A colorful, Monday.com-style web app to supervise PhD students.

- **Kanban tickets** with status, priority, category, due dates, assignees, drive links, comments
- **Per-student profiles** linking tickets, calendar, Drive folders, and chat
- **Calendar** backed by Google Calendar (sync existing events, create new events that get pushed back)
- **Files** — browse each student's Google Drive folder inside the app
- **Chat** — in-app real-time channels (1:1 with each student, co-supervisor side-channels, plus general)
- **Team** view of supervisors, co-supervisors, and students
- **Google sign-in** for everyone, with role-based access (supervisor / co-supervisor / student)

Built with Next.js 16, TypeScript, Tailwind 4, Prisma + SQLite, NextAuth v5, googleapis.

## Stack

- **Frontend**: Next.js App Router, React 19, Tailwind v4, Radix primitives, lucide-react
- **Auth**: NextAuth v5 (Auth.js) with Google OAuth, database sessions via Prisma adapter
- **Database**: SQLite via Prisma (file `prisma/dev.db` — swap to Postgres for production)
- **Google APIs**: `googleapis` library — Drive (folders/files listing) + Calendar (events)
- **Realtime chat**: HTTP polling every ~3.5s (good enough for small teams; swap to SSE/Pusher later)

## Quick start

### 1. Install (already done if you generated this repo)

```bash
npm install
```

### 2. Create Google OAuth credentials

You need this for sign-in **and** for Drive/Calendar features.

1. Go to https://console.cloud.google.com/ and create a project (or reuse one)
2. Enable these APIs: **Google Drive API** and **Google Calendar API**
   (APIs & Services → Library → search and Enable each)
3. Configure the OAuth consent screen (External is fine while testing; add your email as a test user)
4. Create credentials: **APIs & Services → Credentials → Create Credentials → OAuth Client ID**
   - Application type: **Web application**
   - Authorized JavaScript origins: `http://localhost:3001`
   - Authorized redirect URIs: `http://localhost:3001/api/auth/callback/google`
5. Copy the Client ID and Client Secret

### 3. Fill in `.env`

```bash
DATABASE_URL="file:./dev.db"
AUTH_SECRET="generate-a-long-random-string"   # openssl rand -base64 32
AUTH_URL="http://localhost:3001"
AUTH_TRUST_HOST="true"
AUTH_GOOGLE_ID="123-abc.apps.googleusercontent.com"
AUTH_GOOGLE_SECRET="GOCSPX-..."

# Single admin email. This account becomes "admin" on first sign-in (full control of all users + students).
ADMIN_EMAIL="you@example.com"

# Comma-separated. Emails in SUPERVISOR_EMAILS get the supervisor role on first sign-in.
SUPERVISOR_EMAILS="you@example.com"
CO_SUPERVISOR_EMAILS="alice@uni.edu,bob@uni.edu"
```

> **Roles**: `admin` > `supervisor` > `co_supervisor` > `student`. The admin sees a red **Admin** entry in the sidebar that opens a page to edit any user's profile and role. Everyone can edit their own name/photo/color from **Settings**. Roles are decided on each sign-in by checking the email against `ADMIN_EMAIL` and the email lists, so you can promote/demote by editing `.env` and asking the user to sign in again — the admin can also change a user's role at any time from the admin page.

### 4. Initialize the database

```bash
npm run db:push   # create tables
npm run db:seed   # optional: load demo students, tickets, channels
```

### 5. Start the dev server

```bash
PORT=3001 npm run dev
```

Open http://localhost:3001 and sign in with Google. The first time, you'll be asked to approve Drive + Calendar access.

> **Role assignment**: anyone whose email is in `SUPERVISOR_EMAILS` becomes a supervisor on sign-in; anyone in `CO_SUPERVISOR_EMAILS` becomes a co-supervisor; everyone else is a student. Changing the lists updates roles on the next sign-in.

## How each module works

### Students
- `Students` tab shows everyone in your supervision portfolio.
- Click a student to open their profile — it links to the same student's Kanban view, Calendar, Drive folder, and Chat channel.
- Supervisors can add new students. Edit a student to paste a **Google Drive folder ID** (the part after `/folders/` in the URL) and a **Google Calendar ID** (e.g. `abc123@group.calendar.google.com`).

### Kanban
- Tickets live in 6 columns: Backlog · To do · In progress · Review · Blocked · Done.
- Drag a card to change its status (optimistic + persisted).
- Each ticket has a student, assignee, priority, category, due date, optional Drive folder URL, and threaded comments.
- Filter by student, priority, or text search.

### Calendar
- Month view with colored dots per student.
- **Sync Google** pulls events from each student's calendar (if linked) and the supervisor's primary calendar for the visible month range.
- **New event** creates a local event AND optionally pushes it to Google Calendar (using the student's calendar if set, otherwise your primary). The student is added as an attendee.

### Files
- Sidebar lists students. Click one to browse its linked Drive folder live, with folder navigation breadcrumbs.
- Files open in Drive in a new tab.

### Chat
- Each student gets a **1:1 channel** automatically when added.
- You can create **Co-supervisor** channels (private side-channel about a student, hidden from the student), or general/direct channels.
- Messages poll every 3.5 seconds — close to real-time without WebSockets.

### Team
- A directory of everyone in the workspace by role.

## What about Google Chat?

The Google Chat API requires a **Google Workspace** account and a **Chat app** registered with admin approval. Personal Gmail accounts can't use it. The in-app chat in PhDapp is a complete replacement that needs no extra setup.

If you do have Workspace, you can add a "Open in Google Chat" deep link on each channel later.

## Common scripts

```bash
npm run dev         # start dev server
npm run build       # production build
npm run db:push     # apply schema to sqlite
npm run db:reset    # wipe and re-seed
npm run db:seed     # seed demo data
npm run db:studio   # GUI for the SQLite db
```

## Deploying

This is structured to deploy to Vercel/Render with one change: swap SQLite for Postgres.

1. Provision a Postgres database (Neon, Supabase, Railway, etc.) and put the URL in `DATABASE_URL`.
2. In `prisma/schema.prisma`, change `provider = "sqlite"` to `provider = "postgresql"`.
3. Run `npx prisma db push`.
4. Set `AUTH_URL` to your production URL and re-issue OAuth credentials with the production redirect URI.

## Roadmap ideas

- WebSocket/SSE for instant chat (drop the polling)
- Per-student progress timeline (milestones, papers, milestones derived from done tickets)
- Mobile-friendly tweaks for the Kanban
- Markdown rendering in ticket descriptions and chat
- @mentions and notifications
- Drag-to-reorder within a kanban column (currently changes status only)
- Google Chat space integration for Workspace users
- Anonymous progress reports for committee meetings
