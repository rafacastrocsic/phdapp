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
- [Thesis & publications](#thesis--publications)
- [Private supervisor notes](#private-supervisor-notes)
- [Weekly check-ins](#weekly-check-ins)
- [Reading](#reading)
- [Supervisor team workspace](#supervisor-team-workspace)
- [Team advisors & their suggestions](#team-advisors--their-suggestions)
- [Workload](#workload)
- [Weekly email digest](#weekly-email-digest)
- [Annual review export](#annual-review-export)
- [Activity log](#activity-log)
- [Notifications](#notifications)
- [Feedback & suggestions](#feedback--suggestions)
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

- **Profile** — name, email, photo, color, program year, status, expected end date, thesis title. The header also shows quick clickable links when set: email, **LinkedIn**, **ORCID** (green iD icon → orcid.org), **Google Scholar** (blue mortarboard icon), and Website. Your own profile (Settings → My profile, or your card on the Team page) takes the same LinkedIn / ORCID / Scholar fields — they render as small icon-links beside your name everywhere you appear in the team.
- **Tasks** — short list of recent tasks for this student.
- **Calendar** — events for them.
- **Drive folder** — Google Drive link if shared.
- **Supervision team** — see [Supervision teams](#supervision-teams) below.

Only **primary supervisors** and the **admin** can edit a student's profile (Edit button at the top of the page).

### Catch-up summary

On a student's profile, the **Catch-up** button (✨, top action row) opens a pop-up with a plain-text digest to get you up to speed fast — without clicking through Tasks, Calendar, etc. It covers: task counts (active / in progress / overdue / recently done), the in-progress / overdue / blocked / due-soon / not-started lists, upcoming and recent calendar events, thesis chapter and publication status breakdowns, and the latest weekly check-in. There's a **Copy** button to drop it into notes or an email. It's **read-only** and available to every non-student with access to that profile — supervisors, co-supervisors, **team advisors**, external advisors, committee, and admin (students don't see it). Wellbeing score is only included for viewers allowed to see supervisor-private material (supervisors/admin/team advisors).

## Supervision teams

Every student has a **primary supervisor** and optionally additional team members. Team roles (assigned **per student**, so the same person can hold different roles on different students):

- **Supervisor** (additional, alongside the primary) — full read/write on that student.
- **Team advisor** — a senior *internal* colleague who follows that student **read-only** (sees everything, including private supervisor notes and wellbeing) but **cannot change anything**; their only action is sending suggestions to the supervisors. See [Team advisors & their suggestions](#team-advisors--their-suggestions).
- **External advisor** — someone *outside* the institution, attached to that student (read-only by default).
- **Committee member** — sits on that student's committee (read-only).

Only the **primary supervisor** or **admin** can manage the team. To do so:

1. Open the student's profile.
2. Click **Manage team**.
3. The dialog shows the current team. Add a person by:
   - Picking them from the **From existing users** dropdown (only non-student accounts appear), or
   - Typing their email in the **By email** field — they must have signed in once already.
4. Pick their role on the right (**Supervisor / Team advisor / External advisor / Committee member**).
5. Click **Add**.

To remove someone, click the **X** on their row. To promote a co-supervisor to primary, click the small **Crown** button on their row.

**Note**: students cannot be added to a supervision team — only non-student accounts.

## Tasks

The **Tasks** module is the heart of the app. Tasks are work items you assign to (or co-track with) a student.

### Three views

- **Board** — Kanban columns from Backlog → To do → In progress → Review → Blocked → Done. Drag cards to change status.
- **List** — table per student showing the full **Group → Task → Subtask** hierarchy (subtasks listed under each task), with status, priority, category, assignee, due date.
- **Gantt** — a timeline grouped by student. Each task is a bar running from its creation date to its due date, coloured by status (dimmed when Done, red outline when overdue), with a dashed "today" line and weekly gridlines. Within each student, tasks are ordered by dependency — a parent first, then the tasks depending on it **indented beneath** it (↳ marker) — so a dependency chain reads top-to-bottom. A ⛓ icon marks tasks with dependencies. Tasks with sub-tasks show a **▾** + `(done/total)`; **click the task label to expand/collapse its sub-tasks**, shown as indented rows with a **◆ marker at each sub-task deadline** (green = done, red outline = overdue, "no deadline" if unset). Click a task's **bar** to open it (label opens it too for tasks that have no sub-tasks).

Toggle with **Board / List / Gantt** at the top right.

### Task dependencies

When creating or editing a task, the **Depends on** field is a drop-down **selector**: choose a parent task and it appears as a removable chip (× to drop it). You can depend on one or more existing tasks of the **same student** (cross-student links and dependency loops are rejected). The app then keeps the status in sync automatically:

- A task with any unfinished parent is moved to **Blocked** automatically.
- Once **all** parents are **Done**, the task auto-moves to **To do**.
- Re-opening a parent re-blocks its dependent children.

This means you generally shouldn't drag a dependency-gated task out of Blocked by hand — finish its parents and it clears itself. Dependent tasks show a ⛓ icon (parents on hover) in List and Gantt.

### Grouping tasks (List view)

**Create a group:** in **List** view, tick the checkbox on any tasks (they must all belong to the **same student**), enter a **group name** in the bar that appears, and **Create group**. When groups already exist for that student the same bar offers **Add to existing group…** to drop the selected tasks into one.

**Group at creation time:** the **New task** form includes a **Group (optional)** dropdown — assign an existing group or **+ Create new group…** (enter a name) so the task starts out grouped.

**Edit a task's group later:** open the task → the **Group** dropdown lets you move it to another group, create a new group from it (**+ Create new group…**), or remove it (**No group**) — no need to re-select. On a group heading you can still **rename** or **disband** (disband only ungroups — tasks are kept); each task also has an **ungroup** link. The toolbar has a **group filter** (a specific group, or **Individual (no group)** only). Grouped task rows carry a coloured left bar in the group's colour, and any tasks not in a group appear under a separate **"Individual tasks"** heading at the bottom — so grouped vs standalone tasks are visually distinct. Groups are organisational only — they don't affect status/due/assignee. (Students get the same grouping for their own tasks.)

The group is also surfaced on the **Board**: each grouped card carries a small **▦ group-name** chip in the group's colour, so the card's group is visible without leaving Board view.

### Filters

Above the board:

- **Search** — by title or description text.
- **All students** — narrow to one student. *(Students don't see this filter — they only ever have their own tasks.)*
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
- **Category** — one of the predefined ones (Research, Writing, **Lab work**, **IC Design**, **Coding**, Reading, Publication, Conference, Meeting, Admin), or pick **Other** and type your own one-time label
- **Due date** — optional. **Setting a due date automatically creates an all-day Google Calendar event** on the student's shared calendar. To remove a due date, click the **Clear** chip next to the date input — this also deletes the linked Google event.
- **Drive folder** — link a Google Drive folder where this task's deliverables live. Click **Pick from Drive** to browse and select a folder. When the task is tied to a specific student, the picker **opens inside that student's shared Drive folder** (the one you provisioned via *Share Drive* on their profile), not in your whole "My Drive" — fewer clicks, less chance of attaching the wrong folder. When the task has **no student** (a team-only task), the picker shows a **multi-root chooser** instead: pick one of the visible students' Drive folders, or the **Team folder** (the URL the admin set on the Team page). Your own "My Drive" is never shown for team-managed work. A small *Browse my Drive instead* link lets you escape the scope on the rare occasions you need to attach something outside it. The same field is also available on **calendar events** — assigned events open inside the student's folder; unassigned events get the same multi-root chooser.

### Visibility — tasks vs. events

Tasks and events have different visibility models:

- **Tasks are always tied to a single student.** No "team-only" or "general" tasks — every task belongs to a specific student, and students only see their own. The Student dropdown in the New task form only shows the visible students.
- **Calendar events are either student-specific or General.** Pick a student in the dropdown for normal supervision events, or *— General (visible to all) —* for group-wide events (seminars, departmental deadlines, open calls). General events are visible to **everyone** including all students. Team-only events are not supported.

Students can only create tasks and events for themselves — they never see the visibility dropdown.

### Filtering events by visibility

The toolbar filter on the Calendar (non-students only) gains one extra entry above the per-student list:

- **— General only —** — show only general events

The Tasks board filter stays as a simple per-student picker.

**Create task** saves and opens the new task in the detail dialog.

### Editing a task

Click a task to open it. Every field saves on change (auto-save). What you can do:

- Change status, priority, category, assignee, due date. **Only you (supervisors/admin) can set a task to Done** — students can't.
- **Confirming completion**: when a student finishes a task they click *Mark as completed* (or drag it to Done). The task gets a **"✓ completion requested"** badge and you're **notified** (🔔 bell + the orange Tasks sidebar badge; an email too if the admin enabled Resend). Review it and move it to **Done** to confirm — or leave it and comment if it isn't actually done. You're likewise notified of any status change a student makes (it shows in the bell as "moved task X → …").
- Edit the description.
- Add **subtasks** (a small checklist) — add, rename, tick off, remove. Useful for breaking complex work into discrete steps. Each subtask can carry **its own deadline**; it must be on or before the task's deadline (an error appears otherwise and it isn't saved). Subtasks **with** a deadline appear on the Calendar as `[Sub-task]_… · <task>` **all-day** entries and are also pushed to Google Calendar (same target as the parent task — student's shared calendar, falling back to General); subtasks without one stay off the calendar. On a subtask row, hover reveals two controls: **Clear** (drops just the deadline, keeps the subtask) and the **🗑 Trash** icon (removes the whole subtask).
- Drop comments. Every comment also marks the task as "updated" for the other team members (they'll see a blue ring around the card next time they visit Tasks). Each top-level comment has a **Reply** action — replies are indented under their parent and notify the parent's author as well as the task's usual recipients. Hover a comment to **Edit** or **Delete** your own (edited ones show **(edited)**); supervisors/admin who can write the student may also delete anyone's comment for moderation. The same threaded conversation is available on **calendar events** — open the event, scroll to the bottom of the dialog.
- **Related events** — events explicitly linked to this task (manually, via the event's *Related task* picker) show up as a list inside the task with title + start time; each row jumps to the Calendar. The task's Board card and List-view row also carry a small teal **📅 N** badge (alongside the comment count) so you can spot at a glance which tasks have meetings or work sessions tied to them. This is independent of the auto due-date mirror event — the badge counts *manual* links only.
- **Links** — a flexible list of external URLs attached to the task: papers (Overleaf, arXiv), websites, repos, references. Each link has a **Label** and a **URL** (auto-prefixed with `https://` if missing); add as many as needed, hover one to **Edit** or **Remove** it. The same Links section is also available on **calendar events** (event dialog → above the comments thread). Distinct from the **Drive folder** field on tasks and the **Meeting URL** field on events — those keep their dedicated buttons; Links is for anything else worth attaching.

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
2. **Task due-date events** auto-generated when a task gets a due date. They render as **all-day** entries (no specific hour), styled as outlined chips with a priority-color stripe; sub-task deadlines use a dashed border and route clicks to their parent task. The title is prefixed **`[Task]_`** / **`[Sub-task]_…`** so they're recognisable even on a synced Google Calendar. Both task and sub-task deadlines are pushed to Google Calendar (same target — student's shared calendar). Clicking a task event opens a quick task view **in place** (you stay on the Calendar); from there **Open in Tasks board** takes you to the full editable task.

### My availability

The **⊘ My availability** button (calendar toolbar) lets you mark periods you're away — conference travel, leave, holidays. Add a From/To range and an optional label *only you see*. Your students see a grey **⊘ &lt;name&gt; away** block on those days; **clicking it** opens a details dialog with who and the dates (students never see the label/reason — you and other supervisors do). It's not a weekly chore; add periods as they come up. You also see other supervisors' availability (with labels, since you're not a student).

### Recurring events

When creating an event, the **Repeats** control lets you make it recur: *Daily / Weekly / Monthly*, every N days/weeks/months, until a chosen date. Recurring events expand across the calendar automatically and are pushed to Google Calendar as a proper recurring series. Opening any occurrence shows a *Repeats: …* note with a **Stop repeating** button. Note (current limitation): editing or deleting a repeating event affects the **whole series** — there's no per-occurrence exception yet; to change one occurrence, stop the series and recreate.

### Four views

Top-right toggle: **Year / Month / Week / Day**.

- **Year** — the whole calendar year as 12 mini-month grids with colored dots per day. Click a day to drop into Month view.
- **Month / Week / Day** — standard calendar views. In Month view a day shows the first few items and a **"+N more"** link that opens that day's **Day view**. In Week/Day, the time grid covers **all 24 hours** and **auto-scrolls** to the current hour (today) or 8 AM (other days) on open — you can scroll up to midnight or down to 23:00. Overlapping events are laid out **side by side in columns** rather than stacked, so concurrent meetings stay readable. **All-day events** (incl. task / sub-task deadlines) appear in a dedicated strip just above the hour grid, not at noon-UTC.

### Creating an event

**New event** top-right:

1. Title (required)
2. Date/time, end date/time
3. Location (optional)
4. Meeting URL (optional)
5. Student to attach it to
6. Description
7. **Related task (optional)** — link the event to one of that student's tasks (the picker is scoped to the chosen student; with no student selected it lists all visible tasks prefixed by student name). Use this for events that *relate to* a task but aren't its deadline — e.g. a meeting where one agenda point is "how are the slides going?" for a task due later. This is independent of the automatic `[Task]_` due-date entry: linking here doesn't move or create the task's deadline, and deleting/archiving the task leaves the event in place (the link just clears).
8. **Push to Google Calendar** checkbox — if checked, it lands on the student's shared Google Calendar too.

Opening a linked event shows a **Related task: …** line — click it for an in-place task peek (you stay on the Calendar). You can add, change, or remove the link later via the event's **Edit** form.

> **Reverse view (from the task):** open the linked task and the **Related events** card lists every event linked to it (title + start time, clickable back to the Calendar). The task's Board card and List-view row also carry a teal **📅 N** badge next to the comment count, so you can spot tasks with attached meetings at a glance — no need to open them. The badge counts *manual* links only; the auto `[Task]_` deadline event isn't counted (it's already represented by the due date).

### Comments on events

Every event has a **threaded comment section** at the bottom of its detail dialog — same component, same JSON shape and same behaviour as the comments on a task. The whole team that can see the event sees the thread, so it's the natural place for pre-meeting questions, post-meeting recaps, agenda nits, links to materials, etc. — anything that belongs *with the event*, not buried in chat. Top-level comments get a **Reply** action on hover (one-level nesting; replies are indented under their parent); your own comments are editable and deletable; any supervisor or admin who can write the event's student can moderate-delete others' comments. Posting a reply notifies the parent comment's author; a new top-level comment notifies the event owner and the student-user. Edited comments get an **(edited)** mark; deleting a parent comment also removes its replies. Activity is mirrored as an `event.update` row in the log so the rest of the team sees recent activity on the event from the Calendar's recent-activity hints.

### Structured 1:1 meetings

You can mark an event as a 1:1 meeting either at creation time (tick **"This is a 1:1 meeting"** in the New event form) or **later** from the event detail dialog (a dashed *"Convert to 1:1 meeting"* button is shown for any event that isn't one yet — click it and the meeting panel appears in place, no reload needed). Opening a meeting event shows the panel:

- **Agenda** — bullet points either party can add before the meeting.
- **Notes** — free text written during the meeting (saves on blur).
- **Action items → tasks** — for each follow-up, type it and (optionally) pick a **deadline**, **priority** and **category** right in the meeting panel, then **Add item**. **Create tasks** turns each into a Task for the meeting's student with those values (defaults: priority Medium, category "meeting", status To do). Open the **Task panel** afterwards to add a description, subtasks, comments, etc. Closes the loop between "we discussed it" and tracked work.

### Editing / deleting

Click an event to open it, then **Edit** to change its details — title, **student**, **date**, **start/end time**, **location**, meeting link, description — and **Save changes** (no need to delete and recreate). The **Student** field lets you (re)assign an event to a student or set it back to *No specific student* — handy for an event created in the general calendar that you later want tied to a particular student (you can only assign to students you supervise; making an event unassigned is supervisor/admin only). If the event is linked to Google Calendar, the change is pushed there too. **Delete** removes the in-app record (and the Google Calendar event, if you choose the "+ Google" option).

> Unassigned ("No specific student") events — and tasks whose student has no shared calendar — are pushed to a **General calendar** the admin configures (see the admin manual). If the admin hasn't set one, they fall back to the event creator's own primary Google Calendar. Reassigning an existing event's student here changes it locally; it does not move an already-pushed Google Calendar event between calendars.

Event times are stored and shown in the **viewer's timezone**, so the start/end you set is what you see (and Google Calendar gets the correct instant). Note: events created before this fix may display a start/end shifted by your UTC offset the first time they're opened — re-saving the correct time once permanently corrects that event (older events are not auto-migrated).

### Sharing the calendar with the team

When you add someone to a supervision team, the system tries to share the student's Google Calendar with them automatically (if you're signed in with Google). If sharing fails or someone joined the team late, open the student's profile → **Sync calendar** to refresh the access list.

## Chat

The **Chat** module is for ongoing conversation with each student and their team.

- **Auto team channel**: every student gets a **"Team · ‹name›"** channel created automatically when they're added — shared by the whole supervision team (primary + co-supervisors, minus read-only team advisors) and the student. (Already-existing students can be backfilled by the admin from **Admin → Maintenance**.)
- **Channels** column (left): a list of every channel you're a member of. Click the **+** to create a new one (per-student, custom names possible).
- **Messages**: type at the bottom, Enter to send. **Paperclip** for attachments (25 MB max; chat attachments are auto-purged after 7 days).
- **Edit your own messages**: hover a message and use the **✎ Edit** action next to **↩ Reply**. The bubble swaps for an inline editor — **Enter** saves, **Esc** (or Cancel) discards. Edited messages get a small italic **(edited)** marker next to the timestamp so the history stays transparent.
- **Delivery ticks** on messages you send (WhatsApp-style): **one grey ✓** sent · **two grey ✓✓** delivered · **two blue ✓✓** seen by another member (updates within a few seconds of them opening the channel).
- **Browser-tab alerts**: with unread messages the tab title becomes **"(N) … messaged you"** and the favicon shows a red count badge, plus a short sound on each new message — so you don't miss one while working in another tab.
- **Notification sound**: channel **⋮ → Notification sound…** to choose the sound (Chime/Ding/Pop/None) and volume (per device, with a Test button).
- **Reply** to a specific message with the **↩ Reply** action (shows a quoted snippet); **drag-and-drop** files or **paste images** (Ctrl/Cmd+V) directly into the composer.
- **Edit channel**: **⋮ → Edit channel** lets you change the **name, description, colour, and members**. Changing membership asks for confirmation (removed people lose access and history; added people see all past messages). Available to any member of the channel.

You can collapse the channels column with the chevron at the top of that column. Same with the main left sidebar.

## Files

The **Files** module shows the Google Drive folder shared with each student. Click any file/folder to open in Drive. Star favorites for quick access.

If a student doesn't have a shared Drive folder yet, you (as primary supervisor) can create one from their profile page → **Share Drive**.

**Who is auto-shared on the folder (and on the student's shared Calendar):** the student, the primary supervisor, additional supervisors / co-supervisors, and **team advisors**. **External advisors and committee members are deliberately not auto-shared** — they have a lighter relationship and shouldn't see every file or 1:1 meeting. If you specifically need to give them access, share the folder or calendar with them directly from Google Drive / Google Calendar.

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
- The **Reading** sidebar item shows a count bubble (and a 🔔 bell entry) when a student proposes a reading, or when a co-supervisor adds, decides on, or removes one (clears when you open Reading); the page auto-refreshes so new proposals/changes/removals by others appear within a few seconds without reloading.

## Supervisor team workspace

At the top of the **Team** page (visible to supervisors and the admin only — hidden from students, external advisors, and committee members) is the **Supervisor team workspace**: a shared Drive-folder link (the admin sets it) plus an internal group-notes thread for the supervisory team — templates, group policy, inter-supervisor minutes. Anyone supervisor-level can post; the author or admin can delete a note. Team advisors do **not** see this workspace.

## Team advisors & their suggestions

A **team advisor** is a senior *internal* colleague — different from an *external advisor*, who is outside the institution. Team advisor is a **per-student** role (like external advisor/committee): an advisor is assigned to *specific* students and follows those **read-only** (they can even see private supervisor notes and wellbeing) but **cannot change anything** — their only action is sending you suggestions. Because it's per-student, the same person can be the supervisor of one student and a team advisor of another.

On the **Team** page everyone now appears in one **Team members** list, and each person's card spells out exactly who they supervise vs. team-advise (with student names) — so you can see at a glance who is doing what, and who wears both hats. Just below the Supervisor team workspace you'll see the **Advisor suggestions** card: the thread of suggestions advisors have sent. A suggestion may be tagged with one or more students (shown as colored chips) or marked **General** (no specific student). You can't post here — only advisors do — but you can delete a suggestion you no longer need (admins can delete any).

When an advisor posts something new, the **Team** item in the sidebar shows a count bubble; it clears when you open the Team page. (This is intentionally kept off the 🔔 bell so advisor↔supervisor notes never reach students.)

## Workload

The **Team** page has two read-only workload tables:

- **Workload** (per supervisor): students supervised (and how many active), open tasks, overdue (red if any), and tasks assigned directly to them — sorted by open-task count. Spot which *supervisor* is overloaded / for fair distribution.
- **Student workload** (per student): supervisor, status, open tasks, overdue — sorted by load. Spot which *student* is drowning in tasks or has gone idle. Click a row to open that student.

## Weekly email digest

> ⚠️ **Not active yet.** The weekly digest is built but **not switched on** — no emails are currently sent. It will start working once the admin connects an email sender (tracked in `IMPROVEMENT_PLAN.md` → FUTURE). The section below describes how it will behave once enabled. In the meantime, use the in-app 🔔 bell and sidebar badges.

Once enabled, you'd get a **Monday morning email** summarising what needs attention across **the students you supervise**: overdue tasks, reading proposals awaiting your approval, new weekly check-ins, and low-wellbeing flags (a check-in scoring ≤ 2 this week). It's a once-a-week roll-up — distinct from the instant 🔔 bell and any per-event emails.

Details worth knowing:

- **Scope = students you actually supervise** — primary supervisor, or co-supervisor. Students you only **team-advise** (or external-advise / sit on the committee for) are **not** in your digest. A person whose only role is *team advisor* doesn't receive a digest at all (they're read-only observers).
- **Only sends when there's something to report** — if every counter is zero that week you get no email (no empty digests).
- **Opt out anytime** in **Settings → Notifications** (the "weekly digest" toggle, per-person).
- **Timing**: sent Mondays ~07:00 UTC. It only actually goes out once the admin has configured the email provider (see the admin manual); until then nothing is sent and nothing breaks.

## Annual review export

A student profile has an **Annual review** button. It opens a clean, print-styled progress packet for a period (defaults to the last 12 months; override with `?from=&to=` in the URL). It leads with a **student-details header** — full name, email, programme year, status, start & expected-end dates, research area, ORCID, supervisor, and the review period — then thesis chapters, publications, tasks completed/overdue, supervision meetings + notes, and the weekly check-in text summary. Click **Print / Save as PDF** for the formal document: the app sidebar and top bar are hidden on print and the content flows across pages, so the PDF is just the review itself. **Wellbeing scores and private supervisor notes are deliberately excluded.** External advisors/committee can view it read-only.

## Activity log

The **Log book** (red icon, sidebar) is a chronological record of everything that's happened in the workspace: tasks created/updated/deleted, events created/updated/deleted, profile changes, team changes. Useful when:

- A student says "but I never saw that task" — check who created it and when.
- You want a quick view of what your co-supervisor has been up to.

Each entry shows: actor, action, timestamp, student involved, and (for task entries) an **open task** link. That link shows the task in a quick view **without leaving the Log book** — close it and you're still in the Log; use **Open in Tasks board** there to jump to the full task.

Entries are kept **clean and self-explanatory**: only *actual* changes are recorded (opening a task and leaving a field unchanged, or reverting an edit, logs nothing), and a summary reads like "*"Draft intro" — moved to In progress, due May 20*" rather than a list of internal field names. Because the task editor auto-saves, a burst of small text edits to the same task is **collapsed into a single entry** that reflects the final state; meaningful workflow changes (status, priority, assignee, due date, dependencies) each keep their own distinct entry so nothing important is hidden.

## Notifications

The **🔔 bell** in the top bar carries a red **unread count badge** and lists recent activity from your students and co-supervisors — a task or event someone created/updated/deleted, a reading added or a proposal awaiting your decision, a co-supervisor's away period, etc. It only shows changes *others* made (never your own actions) and only for students you can see. Click an item to jump to it, or **"Mark all read"** to clear the badge. This is in addition to the weekly email digest and the sidebar/board highlight badges. (Per-event emails also go out if the admin configured Resend.)

When you **comment** on a student's task, or make a **meaningful change** to it (status, priority, assignee, due date, dependencies), the **student is always notified directly** — bell + Tasks badge, plus email if Resend is set up — regardless of whether they're the task's assignee or creator. So a comment or update you make on their work reliably reaches them.

## Feedback & suggestions

The **Feedback** entry in the sidebar (📣 megaphone) sends a bug report, improvement idea, or general feedback straight to the app's administrators. Choose the type, add a summary and message, optionally **attach a photo/screenshot**, and **Send to admins**. Your submissions stay on that page with a status (Open / Planned / In progress / Done / Declined) and admin replies shown inline as a **threaded conversation** — you can **Reply** back to an admin's response and they can reply again, so a single piece of feedback can hold the whole exchange. ⌘/Ctrl + Enter sends a reply; you can delete your own replies. You get a sidebar badge (and an email if Resend is configured) when anyone posts in your thread. Available to everyone, including students. (If *you* are also an admin you'll instead see the triage view — see the admin manual.) Entries can be **collapsed** (click the header, or **Collapse all**) to a single title line to keep a long list manageable.

## Your profile

Top-right avatar → **Edit profile**. You can change name, color, photo, **external profile links** (LinkedIn / ORCID / Google Scholar — informational icon-links shown beside your name in team views) and **alternate emails** — a list of secondary email addresses kept on your profile for reference (institutional + personal). Alternate emails are *informational only* — notifications and login still use your primary Google account. Your role and permissions are managed by the admin.

For **students**, alternate emails exist in *two* independent places, mirroring how LinkedIn / ORCID work: (1) on their **user account** (Settings → My profile, set by the student themselves), and (2) on their **student record** (the *Edit student* dialog you can open on the student's profile if you're their primary supervisor or admin). The student-profile header shows the alt emails from the *student record*. This duplication is intentional — it lets you fill in a student's contact details before they sign in for the first time.

## Permissions cheat sheet

| Action | Primary supervisor | Co-supervisor | External advisor | Committee | Team advisor | Admin |
|---|---|---|---|---|---|---|
_"Team advisor" is per-student — the ticks below apply only to the students that person is assigned to advise._

| View student profile | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ (all students) |
| See private supervisor notes & wellbeing | ✓ | ✓ | – | – | ✓ | ✓ |
| Edit student profile | ✓ | – | – | – | – | ✓ |
| Create / edit / delete tasks for the student | ✓ | ✓ | ✓ | ✓ | – | ✓ |
| Manage the supervision team | ✓ | – | – | – | – | ✓ |
| Create calendar events for the student | ✓ | ✓ | ✓ | ✓ | – | ✓ |
| Chat in the student's channels | ✓ | ✓ | ✓ | ✓ | – | ✓ |
| Share / provision the student's Google Calendar | ✓ | – | – | – | – | ✓ |
| **Auto-included** on the student's shared Drive folder & Calendar | ✓ | ✓ | – | – | ✓ | n/a |
| See the student's activity (profile / modules) | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| Send suggestions to the supervisors | – | – | – | – | ✓ | ✓ |

_**Task comments** are communication, not a task edit: anyone who can **see** a student (incl. team advisors, external advisors and committee members) can post comments on that student's tasks. The "read-only" limit on team advisors refers to changing data (tasks/events/profile), which they still cannot do._

_**Chat:** students can start a chat channel only with their **own supervisors** (primary + co-supervisors) — never with team/external advisors, committee members, or other students. Team advisors get **no** chat access unless a supervisor explicitly adds them to a specific channel._

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
