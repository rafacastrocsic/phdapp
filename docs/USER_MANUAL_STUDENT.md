# PhDapp — Student manual

A short guide to using PhDapp as a PhD student. Read top to bottom the first time; later use the table of contents to jump around.

- [Welcome](#welcome)
- [Signing in](#signing-in)
- [Your supervision team](#your-supervision-team)
- [Your dashboard](#your-dashboard)
- [Tasks](#tasks)
- [Calendar](#calendar)
- [Chat](#chat)
- [Files](#files)
- [Thesis & publications](#thesis--publications)
- [Reading](#reading)
- [Weekly check-in](#weekly-check-in)
- [Annual review](#annual-review)
- [Your profile](#your-profile)
- [Notifications](#notifications)
- [Feedback & suggestions](#feedback--suggestions)
- [Tips](#tips)
- [If something breaks](#if-something-breaks)

---

## Welcome

PhDapp is your personal supervision workspace. Your supervisor uses it to track your work, share calendars, send you tasks and chat with you. You see only your own things — never other students' data.

Besides your supervisor(s), other people may be attached to your record — see [Your supervision team](#your-supervision-team) below for who they are and what they can (and can't) do.

## Signing in

1. Open the link your supervisor gave you (something like `https://phdapp.vercel.app`).
2. Click **Sign in with Google**.
3. Choose the Gmail account your supervisor added you with. If you see "Access blocked" your email isn't on the test users list yet — ask your supervisor to add it.
4. The first time Google may show a warning: *"Te han dado acceso a una aplicación que aún se está probando"* / *"You've been given access to an app that's still being tested"*. This is expected — click **Continue** / **Continuar**.

You're in. From here on the site remembers you on this browser.

## Your supervision team

A few different people may be attached to your record. You don't manage any of this (your supervisor or the admin does) — but it helps to know who can see your work:

- **Primary supervisor** — your main supervisor. Full access: creates tasks/events, edits your profile, chats with you.
- **Supervisor (additional)** — a co-supervisor with the same access as the primary.
- **Team advisor** — a **senior member of the group** assigned to follow you. They can **see everything about your work read-only** — including tasks, calendar, reading, thesis, *and* private supervisor notes and your wellbeing score — but they **cannot change anything**. Their only action is sending **suggestions to your supervisors** (you don't see those, and you don't interact with the advisor directly in the app). Think of them as a senior pair of eyes looking out for your progress.
- **External advisor** — a collaborator from **outside the institution** attached to your record (read-only).
- **Committee member** — someone on your assessment committee (read-only).

You always see **only your own** data — never other students'. None of these roles can see another student's things on your account.

## Your dashboard

The landing page (the house icon, top-left of the sidebar) shows:

- **Open tasks** — how many tasks you have that are not yet done.
- **Overdue** — tasks whose due date has passed.
- **Upcoming events** — the next five things on your calendar.
- **Recent activity** — what changed lately on your tasks.

Click any card to drill in.

## Tasks

The **Tasks** module (orange icon, sidebar) is where most of the day-to-day work lives.

### Three views

- **Board** (default) — Kanban columns from "Backlog" to "Done". Drag cards left/right to change their status.
- **List** — your tasks as a table, showing the full **Group → Task → Subtask** hierarchy: subtasks are listed under each task, and tasks can be organised into named **Groups**.
- **Gantt** — a timeline. Each task is a bar running from when it was created to its due date, grouped by student, with a dashed "today" line and weekly gridlines. Tasks are ordered by dependency: a parent task comes first and the tasks that depend on it are listed **indented underneath** it (with a ↳ marker), so you can read a chain top-to-bottom. A ⛓ icon marks tasks that depend on other tasks. A task with sub-tasks shows a **▾** and an `(done/total)` count — **click its label to show/hide its sub-tasks**, which appear as indented rows with a **◆ diamond at each sub-task's deadline** (green when done, red-outlined if overdue, or "no deadline" if none). Click a task's **bar** to open the full task (and for tasks without sub-tasks, clicking the label opens it too).

Toggle between them with the **Board / List / Gantt** switch at the top right.

### Grouping tasks (List view)

**Create a group:** in **List** view each task row has a checkbox. Tick the tasks you want (all the same student — always you), type a **group name** in the bar that appears, and click **Create group**. If a group already exists you can instead pick **Add to existing group…** in that same bar to drop the selected tasks into it.

**Set a group while creating a task:** the **New task** form has a **Group (optional)** dropdown — choose an existing group or **+ Create new group…** (type the name) so the task is grouped the moment it's created.

**Change one task's group anytime:** open a task and use the **Group** dropdown — pick an existing group, choose **+ Create new group…**, or set it to **No group**. So you don't need to re-select tasks to fix grouping after the fact.

On a group heading you can **rename** or **disband** it (disbanding just ungroups the tasks, it doesn't delete them); each grouped task also has a small **ungroup** link. A **group filter** in the toolbar lets you show just one group, or only **Individual (no group)** tasks. Tasks inside a group carry a coloured left bar (the group's colour); any tasks not in a group are listed under an **"Individual tasks"** heading at the bottom, so grouped and standalone tasks are easy to tell apart at a glance. Groups are purely organisational — they don't change a task's status, due date, etc.

A grouped task also shows its group as a small **▦ group-name** chip (in the group's colour) on its **Board** card, so you can see which group a card belongs to without switching to List view.

### Task dependencies

When you create or edit a task you can say it **depends on** one or more existing tasks (the "parent" tasks). In the new-task and edit-task dialogs the **Depends on** field is a drop-down **selector**: pick a parent task from the list and it's added as a removable chip below (click the × on a chip to remove it). Only tasks belonging to the same student are selectable, and you can't create a loop (A depends on B depends on A).

- As soon as a task has at least one unfinished parent it is automatically moved to **Blocked**.
- When **every** parent is set to **Done**, the task automatically moves back to **To do**.
- If a parent is later re-opened, its blocked children become **Blocked** again.

Tasks with dependencies show a ⛓ icon (with the parent list on hover) in the **List** and **Gantt** views.

### What's on a task

- Title and description
- **Status** — Backlog → To do → In progress → Review → Blocked → Done. **You can move a task through every column except Done** — only a supervisor sets Done (see "Marking a task completed" below).
- **Priority** — Low / Medium / High / Urgent (a colored "L/M/H/U" tag)
- **Category** — Research, Writing, Lab work, IC Design, Coding, Reading, Publication, Conference, Meeting, Admin… or **Other** with your own custom label
- **Due date** — when you set one, an event automatically appears on your calendar
- **Drive folder** — link a Google Drive folder by clicking **Pick from Drive** and browsing your Drive (no need to paste a URL). Once linked, an **Open Drive folder** button appears in the task, and the task card shows a small folder icon you can click to jump straight to the folder.
- **Assignee** — usually you
- **Subtasks** — a small checklist inside the task; tick items as you go. The card shows a `2/5` style progress badge. Each subtask can also be given its **own deadline** (date picker next to it). A subtask's deadline can't be later than the task's own deadline — if you pick a later date you'll get an error and it won't save. Any subtask that has a deadline also shows up on the **Calendar** as a `[Sub-task] … · <task>` entry (subtasks with no deadline don't appear on the calendar).
- **Comments** — threaded discussion at the bottom. Hover one of your own comments to **Edit** or **Delete** it; an edited comment is marked **(edited)**. (Your supervisors can also remove comments for moderation.)

### Marking a task completed

You **can't** set a task to **Done** yourself — that's a supervisor's confirmation. When you've finished a task:

1. Open it and click **Mark as completed** (or just drag the card to the Done column — it's treated the same).
2. The task gets a **"✓ completion requested"** badge and your supervisors are **notified** (their 🔔 bell + the Tasks badge).
3. A supervisor reviews it and moves it to **Done**. (If they think it's not done, they'll leave it and usually comment.)

Your status changes in general (e.g. To do → In progress) are also visible to your supervisors, so they can follow your progress.

### Editing

Click a task to open the detail dialog. Changes save automatically as you type/select (no "Save" button).

### Creating a task

Top-right **New task** button. Pick a title, optional description, priority/category, and a due date if you want. Press Enter or click **Create task**.

### Deleting

Inside a task dialog → red **Delete** button at the bottom-left. You'll be asked to confirm. After deleting, an **"Undo"** toast appears at the bottom for a few seconds — click it to bring the task back. (Deleted tasks are archived, not wiped, so an accidental delete is recoverable via Undo.) If your supervisor deletes one of your tasks while you're looking at the board, a dashed-red placeholder appears with the title struck through — click the **X** on it to dismiss.

## Calendar

The **Calendar** module (teal icon) shows:

- **Real events** — meetings, deadlines your supervisor created. Solid colored chip with a time.
- **Task events** — every task with a due date appears as an outlined chip with a small circle icon and a single-letter priority tag (L/M/H/U). Its name is prefixed **`[Task]_`** (and sub-task deadlines show as **`[Sub-task]_…`**) so it's clearly task-derived, including on a synced Google Calendar. Click it to see the task in a quick view **without leaving the Calendar**; close it and you're still on the Calendar. Use **Open in Tasks board** in that view to go to the full task on the Tasks board.
- **Events linked to a task** — a normal event can also be *connected* to a task without being its deadline. For example, a task "Finish the slides" is due next month, but a supervision meeting this week will partly be about how those slides are going — that meeting can be linked to the task. Open such an event and you'll see a **Related task: …** line; click it to peek at the task. (This is separate from the automatic `[Task]_` due-date entry above.)

### Four views

Top-right toggle: **Year / Month / Week / Day**.

- **Year** — 12 mini-months with dots per day, useful for big-picture planning.
- **Month** — the standard month grid. A day shows the first few items; click **"+N more"** to jump into that day's **Day view** and see everything.
- **Week / Day** — hour-by-hour timetable with current-time line. Events that overlap in time are placed **side by side** in columns instead of stacking on top of each other, so a busy day stays readable.

### 1:1 meetings

If a calendar event is marked as a 1:1 meeting, opening it shows an **agenda** (you can add points before the meeting too), **notes**, and **action items**. Action items your supervisor creates become Tasks for you — each can carry a deadline, priority and category set during the meeting, and you can flesh it out further in the Task panel.

### Supervisors' availability

On the calendar you may see grey **⊘ Unavailable** blocks on some days — that means one of your supervisors marked themselves away (travel, leave, holidays) so you know not to expect a reply or to drop by then. You only see "Unavailable" — never the reason. It shows in every view (Month, Year, Week, Day), and the Calendar sidebar gets an unread count bubble when a supervisor adds a new away period (clears when you open the Calendar). **Click an "away" block** to see exactly which supervisor(s) and the dates (you still don't see the reason).

### Creating an event

You usually don't need to — your supervisor schedules things. But if you want to add something personal, click **New event** top-right.

If the event has a Google Calendar push enabled, it lands on your supervisor's shared calendar too. The **Repeats** option makes an event recur (daily/weekly/monthly until a date) — handy for a standing weekly slot. The **Related task (optional)** picker lets you connect the event to one of your tasks (e.g. a work session or meeting about that task); it doesn't change the task's own deadline.

To change an event afterwards, click it → **Edit**, adjust the date, time, location, link or description, then **Save changes** (you don't need to delete and recreate it). Event times are saved in **your** timezone, so the time you pick is the time you'll see. (One-off note: an event created before this was fixed may show a shifted start/end the first time you open it — just set it to the correct time once and save; it stays correct after that.)

## Chat

The **Chat** module (green icon) is for direct messages with your supervisor and co-supervisors. You automatically have a **"Team"** channel shared with your whole supervision team, and you can also start your own channels.

- **Left column**: list of channels. Click one to open it.
- **Top header**: who's in the channel.
- **Message box at the bottom**: type, press Enter to send. Click the paperclip to attach a file (max 25 MB; chat attachments are auto-deleted after 7 days).
- **Bold channel name + pink dot** in the sidebar = unread.
- **Delivery ticks** (WhatsApp-style) on the messages you send: **one grey ✓** = sent; **two grey ✓✓** = delivered (the channel has someone to receive it); **two blue ✓✓** = seen (someone else has read up to that message). Ticks turn blue within a few seconds of the other person opening the channel.
- **Browser-tab alerts** — when you have unread messages, the browser tab title shows **"(N) … messaged you"** and the favicon gets a red badge with the count, so you notice even when PhDapp isn't the tab you're looking at. A short sound also plays when a new message arrives.
- **Notification sound settings** — channel actions menu (⋮) → **Notification sound…**: pick the sound (Chime / Ding / Pop / None) and volume, with a **Test** button. Saved on this device.
- **Reply to a message** — hover a message and click **↩ Reply**; your message shows a quote of the one you replied to.
- **Attach files fast** — besides the paperclip, you can **drag-and-drop** files onto the message area, or **paste an image** (Ctrl/Cmd+V) straight into the box.
- **Start a new channel** with the **+** at the top of the channels column. You can only create one with **your own supervisor(s)** — not with team/external advisors, committee members, or other students.

You can collapse the channels column to icons-only with the small chevron at the top of that column. Same trick on the main left sidebar.

> **About attachments:** files you attach are shared via an unguessable link and auto-deleted after 7 days. They aren't individually password-protected, so anyone given that exact link could open it within those 7 days — don't paste highly sensitive material into chat (a stronger private-file scheme is a planned improvement).

## Files

The **Files** module (blue icon) shows the Google Drive folder your supervisor shared with you. Click any file or folder to open it in Drive (a new tab).

Star a file with the star icon to bookmark it. Starred files appear at the top.

## Thesis & publications

On your profile page there's a **Thesis & publications** card. You and your supervisors can both edit it:

- **Thesis chapters** — add each chapter, set its status (Planned → Drafting → In review → Revising → Done), and reorder them with the ▲/▼ buttons.
- **Publications** — add papers with type (journal/conference/preprint), status (in prep → submitted → under review → revisions → accepted/published), and venue.
- **Drive link** — click the **Drive** button on a chapter or publication to pick a file or folder **from your shared supervision Drive folder** (it browses *your* Drive folder, not anyone else's). An open-in-Drive icon appears once linked.

Changes save automatically.

## Reading

The **Reading** module (book icon, sidebar) is your paper reading list:

- **To read / Reading / Read** — papers your supervisors added for you. Use **Start reading** then **Mark read** to track your progress.
- **Propose a reading** — found a paper you think is relevant? Add it (title, authors, link) and use the **"Why is this relevant?"** box to tell your supervisor why — they see this when deciding. It shows as **Pending approval** until a supervisor clicks **Approve** ("OK, go ahead and read it") — or they may reject it. When they approve or reject they can leave a short **comment / reason**, which appears under the item so you know why.  Approved ones move into your list.

The **Reading** sidebar item shows a count bubble when a supervisor adds a reading, decides on one of your proposals, or removes a reading (clears when you open Reading); these also show in the 🔔 bell. The page also refreshes itself, so additions, approvals and removals by others appear within a few seconds without reloading.

## Weekly check-in

On your **Dashboard** there's a **Weekly check-in** card (~2 minutes, once a week):

- *What did you get done* / *Anything blocking you* / *Plan for next week* — your supervisors read these.
- *How are you doing? (1–5)* — a wellbeing dial. **Only supervisors see this number**, not external advisors or committee members. It's there so a supervisor can notice early if you're struggling.

Submit it; you can edit the same week's entry anytime. It saves one entry per week.

## Annual review

Your profile has an **Annual review** button — a printable summary of your progress over the year. It opens with a **student details** header (full name, email, programme year, status, start / expected-end dates, research area, ORCID, supervisor, review period) followed by thesis chapters, publications, tasks done/overdue, meetings, and check-in highlights. Useful to prepare for your formal annual review. Your wellbeing scores and any private supervisor notes are **not** included. When you **Print / Save as PDF**, only the review prints — the sidebar and top bar are automatically hidden, so you get a clean document.

## Your profile

Click your avatar at the top-right → **Edit profile**. You can change:

- Your display name
- Your color (used for your avatar and the stripe on your tasks)
- Your photo
- **External profile links** — LinkedIn, ORCID, Google Scholar. These render as small icon-links next to your name on your profile header and on team views. Leave any blank to hide it.

You **cannot** change your role or your supervisor — ask your supervisor or the admin for that.

## Notifications

There's a **🔔 bell** in the top bar with a red **count badge** when something changed that you haven't seen yet — a supervisor created or updated one of your tasks or events, added or decided on a reading, marked themselves away, etc. (your own actions don't notify you). Click the bell for the list; click an item to jump straight to it, or **"Mark all read"** to clear the badge. If the admin has email set up, you also get an email for the main ones.

Other places that show "you have new stuff":

1. **Sidebar badges**: a pink dot/number on Chat for unread messages; orange on Tasks for new/updated tasks; teal on Calendar for new/updated events.
2. **Task cards** with new/updated activity have a colored banner across the top until you open them.
3. **Calendar events** with new/updated activity have a red/blue ring around them until you click them.

Click an item to acknowledge — the badge clears next time you reload.

Specifically: whenever a supervisor **comments** on one of your tasks, or makes a **meaningful change** to it (moves its status, changes priority or assignee, sets/clears the due date, or edits its dependencies), you're notified directly — it shows in the 🔔 bell and the orange Tasks badge, and (if the admin has email set up) you also get an email — even if you weren't the task's assignee or its creator. So you won't miss a supervisor's comment or update on your work.

## Feedback & suggestions

The **Feedback** entry in the sidebar (📣 megaphone) is a direct line to the app's administrators. Use it to:

- **Report a bug** — something broke or behaves wrong. Say what happened, what you expected, and how to reproduce it.
- **Suggest an improvement** — an idea to make PhDapp better.
- **Other** — anything else you want the admins to know.

Pick the type, add a short summary and a message — and optionally **attach a photo** (e.g. a screenshot of the problem; PNG/JPG/WEBP/GIF) — then **Send to admins**. Your submissions stay on that page so you can track them: each shows a **status** (Open → Planned → In progress → Done, or Declined) and, when an admin writes back, their **reply** appears right under your message. The reply is a **back-and-forth thread** — you can **Reply** to an admin's response (and they can reply back), so a single feedback can hold the whole conversation. ⌘/Ctrl + Enter sends a reply quickly; the trash icon next to your own replies deletes them. You'll get a sidebar badge (and an email, if email is configured) when anyone posts in your thread. You can delete your own submissions any time. Click an entry's header (or **Collapse all**) to **collapse** it down to just its title — handy when the list gets long.

## Tips

- **Drag-and-drop** tasks across columns instead of opening them and switching status. (Dragging to **Done** sends a completion request to your supervisor rather than completing it yourself.)
- **Subtasks** are great for breaking "Write paper" into "draft intro / draft results / share / submit".
- **Due dates auto-sync to your calendar** — if you want something on your calendar, give it a due date.
- **Collapse the sidebars** when you want more room (chevron at the bottom of the main sidebar, or at the top of the chat channels column).
- **Refresh the page** if anything looks stale — the live updates are good but not perfect.

## If something breaks

- **"Access blocked" on sign-in** → your Gmail isn't on the test list. Ask your supervisor.
- **"This app isn't verified" warning** → click **Continue / Continuar**, it's expected.
- **You uploaded a photo / file and it didn't appear** → reload the page once.
- **Calendar event missing** → the calendar syncs from Google in the background; pull-to-refresh or click the refresh icon top-right.
- **Anything else** → tell your supervisor and they'll forward it to the admin.
