# PhDapp — Supervisor / Co-supervisor / External advisor / Committee member manual

This manual is for anyone supervising or advising a PhD student in PhDapp. The features you can use depend on **your role** for each student, summarized at the bottom.

- [Welcome](#welcome)
- [Signing in](#signing-in)
- [Your dashboard](#your-dashboard)
- [Students](#students)
- [Supervision teams](#supervision-teams)
- [Tasks](#tasks)
- [Calendar](#calendar)
- [Chat](#chat)
- [Files](#files)
- [Activity log](#activity-log)
- [Your profile](#your-profile)
- [Permissions cheat sheet](#permissions-cheat-sheet)
- [Tips](#tips)
- [If something breaks](#if-something-breaks)

---

## Welcome

PhDapp is your supervision hub. You see every student you're a primary supervisor of, plus any students you've been added to as a co-supervisor, external advisor, or committee member. The admin (a single account) sees and manages everyone.

## Signing in

1. Open the link the admin gave you (e.g. `https://phdapp.vercel.app`).
2. Click **Sign in with Google** → pick the Gmail address you were invited with.
3. If you see "Access blocked", your email is not yet on the test users list — tell the admin which Gmail address you signed up with.
4. Google may show "this app is still being tested" — click **Continue**.

The browser remembers you next time.

## Your dashboard

The home screen (top-left house icon) shows aggregate stats:

- **Students** — how many you're connected to.
- **Open tasks** — across all your students.
- **Overdue** — needs attention.
- **Upcoming events** — your next five calendar items.
- **Recent activity** — chronological feed of things teammates did.

## Students

Click **Students** in the sidebar. You see:

- Cards for every student you supervise or advise on.
- A search box at the top to filter by name.
- For each card: the student's photo, name, year, status, supervisor color, task count.

Click a student card to open their profile page. There you'll find:

- **Profile** — name, email, photo, color, program year, status, expected end date, thesis title.
- **Tasks** — short list of recent tasks for this student.
- **Calendar** — events for them.
- **Drive folder** — Google Drive link if shared.
- **Supervision team** — see [Supervision teams](#supervision-teams) below.

Only **primary supervisors** and the **admin** can edit a student's profile (Edit button at the top of the page).

## Supervision teams

Every student has a **primary supervisor** and optionally additional team members. Team roles:

- **Supervisor** (additional, alongside the primary)
- **External advisor**
- **Committee member**

Only the **primary supervisor** or **admin** can manage the team. To do so:

1. Open the student's profile.
2. Click **Manage team**.
3. The dialog shows the current team. Add a person by:
   - Picking them from the **From existing users** dropdown (only non-student accounts appear), or
   - Typing their email in the **By email** field — they must have signed in once already.
4. Pick their role on the right (**Supervisor / External advisor / Committee member**).
5. Click **Add**.

To remove someone, click the **X** on their row. To promote a co-supervisor to primary, click the small **Crown** button on their row.

**Note**: students cannot be added to a supervision team — only non-student accounts.

## Tasks

The **Tasks** module is the heart of the app. Tasks are work items you assign to (or co-track with) a student.

### Two views

- **Board** — Kanban columns from Backlog → To do → In progress → Review → Blocked → Done. Drag cards to change status.
- **List** — flat table grouped by student, showing status, priority, category, assignee, due date.

Toggle with **Board / List** at the top right.

### Filters

Above the board:

- **Search** — by title or description text.
- **All students** — narrow to one student.
- **Any priority** — filter by L/M/H/Urgent.
- **Any category** — filter by category (Other matches custom labels too).

### Creating a task

**New task** top-right → fill in:

- **Title** (required)
- **Description** (optional but useful for context)
- **Student** — which student this task is for
- **Assignee** — usually the student themselves, but can be you or any team member
- **Status** — defaults to Backlog
- **Priority** — Low / Medium / High / Urgent
- **Category** — one of the predefined ones, or pick **Other** and type your own one-time label
- **Due date** — optional. **Setting a due date automatically creates a Google Calendar event** on the student's shared calendar.
- **Drive folder URL** — link to a folder where this task's deliverables live

**Create task** saves and opens the new task in the detail dialog.

### Editing a task

Click a task to open it. Every field saves on change (auto-save). What you can do:

- Change status, priority, category, assignee, due date.
- Edit the description.
- Add **subtasks** (a small checklist) — add, rename, tick off, remove. Useful for breaking complex work into discrete steps.
- Drop comments. Every comment also marks the task as "updated" for the other team members (they'll see a blue ring around the card next time they visit Tasks).

### Deleting (with Undo)

Inside a task dialog → red **Delete** at the bottom-left. Confirm. A task delete is a **soft delete** — an **"Undo"** toast appears bottom-center for ~7 seconds; click it to restore the task (and its calendar event). Deleted tasks are archived, not erased, so accidental deletes are recoverable. When a *teammate* deletes a task, a **dashed red "Deleted" placeholder** appears in its column with the title struck through — this now **persists across reloads** until you next open the Tasks board (and the Tasks sidebar shows an unread count). Click the **X** to dismiss a placeholder.

### Highlights for new / updated tasks

When a teammate creates or modifies a task you can see:

- **Red ring + animated pulse** → newly created since your last visit.
- **Blue ring + animated pulse** → updated since your last visit.

Clicking the card acknowledges it (the ring drops).

## Calendar

Events come from two places:

1. **Real events** you (or anyone with write access) create — meetings, deadlines.
2. **Task due-date events** auto-generated when a task gets a due date. They have a different look: outlined chip with a circle icon and a priority-color stripe. Clicking one jumps to the task.

### My availability

The **⊘ My availability** button (calendar toolbar) lets you mark periods you're away — conference travel, leave, holidays. Add a From/To range and an optional label *only you see*. Your students see a grey **⊘ &lt;name&gt; away** block on those days; **clicking it** opens a details dialog with who and the dates (students never see the label/reason — you and other supervisors do). It's not a weekly chore; add periods as they come up. You also see other supervisors' availability (with labels, since you're not a student).

### Recurring events

When creating an event, the **Repeats** control lets you make it recur: *Daily / Weekly / Monthly*, every N days/weeks/months, until a chosen date. Recurring events expand across the calendar automatically and are pushed to Google Calendar as a proper recurring series. Opening any occurrence shows a *Repeats: …* note with a **Stop repeating** button. Note (current limitation): editing or deleting a repeating event affects the **whole series** — there's no per-occurrence exception yet; to change one occurrence, stop the series and recreate.

### Four views

Top-right toggle: **Year / Month / Week / Day**.

- **Year** — the whole calendar year as 12 mini-month grids with colored dots per day. Click a day to drop into Month view.
- **Month / Week / Day** — standard calendar views.

### Creating an event

**New event** top-right:

1. Title (required)
2. Date/time, end date/time
3. Location (optional)
4. Meeting URL (optional)
5. Student to attach it to
6. Description
7. **Push to Google Calendar** checkbox — if checked, it lands on the student's shared Google Calendar too.

### Structured 1:1 meetings

When creating an event, tick **"This is a 1:1 meeting"**. Opening that event then shows a meeting panel:

- **Agenda** — bullet points either party can add before the meeting.
- **Notes** — free text written during the meeting (saves on blur).
- **Action items → tasks** — list the follow-ups, then **Create tasks** turns each into a Task for the meeting's student (category "meeting", status To do). Closes the loop between "we discussed it" and tracked work.

### Editing / deleting

Click an event to open it. Edit fields then **Save**. **Delete** removes both the in-app record and the Google Calendar event (if linked).

### Sharing the calendar with the team

When you add someone to a supervision team, the system tries to share the student's Google Calendar with them automatically (if you're signed in with Google). If sharing fails or someone joined the team late, open the student's profile → **Sync calendar** to refresh the access list.

## Chat

The **Chat** module is for ongoing conversation with each student and their team.

- **Channels** column (left): a list of every channel you're a member of. Click the **+** to create a new one (per-student, custom names possible).
- **Messages**: type at the bottom, Enter to send. **Paperclip** for attachments (25 MB max; chat attachments are auto-purged after 7 days).
- **Edit / delete** your own messages via the kebab menu on the message.

You can collapse the channels column with the chevron at the top of that column. Same with the main left sidebar.

## Files

The **Files** module shows the Google Drive folder shared with each student. Click any file/folder to open in Drive. Star favorites for quick access.

If a student doesn't have a shared Drive folder yet, you (as primary supervisor) can create one from their profile page → **Share Drive**.

## Thesis & publications

Each student profile has a **Thesis & publications** card:

- **Thesis chapters** — title + status pipeline (Planned → Drafting → In review → Revising → Done), reorderable with ▲/▼.
- **Publications** — type (journal/conference/preprint/other), status (in prep → submitted → under review → major/minor revision → accepted/published/rejected), venue, authors.
- **Drive link** — the **Drive** button opens a picker rooted at **that student's shared Drive folder**; pick a file or a (sub)folder to attach it. Open-in-Drive icon shows when linked.

**Who can edit:** supervisors and the student. **External advisors and committee members see it read-only** (badges instead of editable controls).

## Private supervisor notes

The student profile has an amber **Private supervisor notes** panel — an internal thread for the supervisory team.

- **Visible only to supervisors** (primary + co-supervisors with supervisor role) and the admin.
- **Not visible to the student, external advisors, or committee members** — they don't see the panel at all, and the data is never sent to their browser.
- Any supervisor-level member can post; the note's author (or the admin) can delete their own notes. Use it for candid internal observations you don't want the student to see.

## Weekly check-ins

Each student profile has a **Weekly check-ins** panel — their short weekly self-reports (what they did, blockers, plan, and a 1–5 wellbeing dial). The text is readable by the whole team; the **wellbeing score is visible to supervisors only** (and the student) — external advisors and committee members don't see the number. Use the wellbeing trend as an early-warning signal: a dip for a couple of weeks is worth a conversation. Students submit/edit theirs from their own Dashboard.

## Reading

The **Reading** module (book icon, sidebar) is the paper reading list across your students:

- **Filter by student** (top-right) or see all at once; each item shows which student it's for.
- **Pending approval** — when a student proposes a paper it appears here, along with the student's **"Why is this relevant?"** note. Optionally type a **reason / comment** in the box, then click **Approve** ("OK, go ahead") or **Reject** — your comment is saved and shown to the student under the item.
- **Add a reading** — add a paper directly for a student (pick the student in the form); it's auto-approved. You can include an optional note explaining why.
- Track progress (To read → Reading → Read). Items can be deleted by a supervisor or whoever added them.
- External advisors / committee see the list read-only.
- The **Reading** sidebar item shows a count bubble when a student proposes a reading (clears when you open Reading); the page auto-refreshes so new proposals/changes appear without reloading.

## Supervisor team workspace

At the top of the **Team** page (visible to supervisors and the admin only — hidden from students, external advisors, and committee members) is the **Supervisor team workspace**: a shared Drive-folder link (the admin sets it) plus an internal group-notes thread for the supervisory team — templates, group policy, inter-supervisor minutes. Anyone supervisor-level can post; the author or admin can delete a note.

## Workload

The **Team** page has two read-only workload tables:

- **Workload** (per supervisor): students supervised (and how many active), open tasks, overdue (red if any), and tasks assigned directly to them — sorted by open-task count. Spot which *supervisor* is overloaded / for fair distribution.
- **Student workload** (per student): supervisor, status, open tasks, overdue — sorted by load. Spot which *student* is drowning in tasks or has gone idle. Click a row to open that student.

## Weekly email digest

If enabled by the admin, you get a **Monday email** summarising what needs attention across your students: overdue tasks, reading proposals awaiting approval, new check-ins, and low-wellbeing flags. Turn it off anytime in **Settings → Notifications**. (Only sends when there's something worth reporting.)

## Annual review export

A student profile has an **Annual review** button. It opens a clean, print-styled progress packet for a period (defaults to the last 12 months; override with `?from=&to=` in the URL): profile, thesis chapters, publications, tasks completed/overdue, supervision meetings + notes, and the weekly check-in text summary. Click **Print / Save as PDF** for the formal document. **Wellbeing scores and private supervisor notes are deliberately excluded.** External advisors/committee can view it read-only.

## Activity log

The **Log book** (red icon, sidebar) is a chronological record of everything that's happened in the workspace: tasks created/updated/deleted, events created/updated/deleted, profile changes, team changes. Useful when:

- A student says "but I never saw that task" — check who created it and when.
- You want a quick view of what your co-supervisor has been up to.

Each entry shows: actor, action, timestamp, student involved, and a link back to the entity (if it still exists).

## Notifications

The **🔔 bell** in the top bar carries a red **unread count badge** and lists recent activity from your students and co-supervisors — a task or event someone created/updated/deleted, a reading added or a proposal awaiting your decision, a co-supervisor's away period, etc. It only shows changes *others* made (never your own actions) and only for students you can see. Click an item to jump to it, or **"Mark all read"** to clear the badge. This is in addition to the weekly email digest and the sidebar/board highlight badges. (Per-event emails also go out if the admin configured Resend.)

## Your profile

Top-right avatar → **Edit profile**. You can change name, color, photo. Your role and permissions are managed by the admin.

## Permissions cheat sheet

| Action | Primary supervisor | Co-supervisor | External advisor | Committee | Admin |
|---|---|---|---|---|---|
| View student profile | ✓ | ✓ | ✓ | ✓ | ✓ (all students) |
| Edit student profile | ✓ | – | – | – | ✓ |
| Create / edit / delete tasks for the student | ✓ | ✓ | ✓ | ✓ | ✓ |
| Manage the supervision team | ✓ | – | – | – | ✓ |
| Create calendar events for the student | ✓ | ✓ | ✓ | ✓ | ✓ |
| Chat in the student's channels | ✓ | ✓ | ✓ | ✓ | ✓ |
| Share / provision the student's Google Calendar | ✓ | – | – | – | ✓ |
| See all activity log entries for the student | ✓ | ✓ | ✓ | ✓ | ✓ |

## Tips

- **Set due dates** even on rough drafts — that's what populates the calendar.
- **Use subtasks** for multi-step work; tick them off as you go.
- **Comment for nudges** instead of chatting — comments highlight the task for the student next time they visit Tasks.
- **Star Drive files** you use a lot — they appear at the top of the Files module.
- **Year view** is great at the start of a semester for seeing the cadence at a glance.
- **Collapse sidebars** to make the most of small laptop screens.

## If something breaks

- **A student you added can't sign in** ("Access blocked") → tell the admin their Gmail isn't on the test users list yet.
- **You can't see a task that should exist** → check the **All students** filter at the top of the Tasks module; you may have it set to one student.
- **A calendar event didn't push to Google** → click **Sync calendar** on the student's profile to refresh sharing.
- **An action erroneously failed** → check `/log` to confirm what state you're really in.
- **Anything else** → contact the admin (their email is shown on the sign-in page).
