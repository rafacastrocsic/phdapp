# Mobile browser support — implementation plan

Status: **not started**. Captured for later in case users ask for phone support.

PhDapp is currently desktop-only. The hard blocker is that the navigation sidebar is `hidden md:flex` (disappears below 768px) with **no mobile replacement**, so on a phone you cannot move between modules at all. Everything below is the concrete work to fix that, tiered by priority.

Breakpoint convention: Tailwind `md` = 768px. "Mobile" below means `< md` (`< 768px`); "desktop" means `>= md`.

---

## Tier 1 — make the app navigable on mobile (essential)

Without this, the app is unusable on phones. After this, it's usable but some dense screens stay cramped.

### 1.1 Mobile navigation drawer

- **Files**: `src/components/app-shell/sidebar.tsx`, `src/app/(app)/layout.tsx`, `src/components/app-shell/topbar.tsx`.
- **Current state**: `sidebar.tsx` root is `<aside className="hidden md:flex shrink-0 flex-col ... transition-[width] ...">` (~line 114). On mobile it renders nothing.
- **What to do**:
  - Add a hamburger/menu button to the topbar, visible only on mobile (`md:hidden`).
  - Make the sidebar render as a slide-in overlay drawer on mobile: fixed-position, full-height, `z-50`, with a translucent backdrop that closes it on tap. On desktop keep the existing inline `md:flex` behavior unchanged.
  - Use a client state (or Radix `Dialog`/`Sheet`-style primitive — Radix Dialog is already a dependency) for open/close. Close the drawer on route change so it doesn't stay open after navigating.
  - The existing collapse-to-icons feature is desktop-only; leave it. The mobile drawer should show the full labeled nav.
- **Watch out for**: the sidebar already has `collapsed` localStorage state and unread-badge logic — reuse the label/badge rendering, just change the container behavior responsively. Don't fork the nav list into two copies; share it.

### 1.2 Explicit viewport meta

- **File**: `src/app/layout.tsx` (root layout; has `export const metadata` ~line 15, no `viewport`).
- **What to do**: add a Next.js `export const viewport: Viewport = { width: "device-width", initialScale: 1, viewportFit: "cover" }`. Next 16 auto-injects a default, but set it explicitly so it's intentional and supports notch/safe-area.

### 1.3 Topbar reflow

- **File**: `src/components/app-shell/topbar.tsx` (`<header class="sticky top-0 z-30 flex h-16 ... px-6">`, search box `max-w-md flex-1`, New task button, user menu).
- **What to do**:
  - Reduce horizontal padding on mobile (`px-4` instead of `px-6`).
  - Hide the search input on mobile (`hidden sm:block`) or collapse it to an icon that expands — search is non-critical and currently a non-functional placeholder anyway, so hiding is fine for now.
  - Make the "New task" button icon-only on mobile (drop the text label, keep the `+`).
  - Add the hamburger button (from 1.1) at the far left, `md:hidden`.
  - Ensure the row never overflows: the user-menu chip should truncate the name on narrow screens.

**Tier 1 acceptance**: on a 375px-wide viewport you can sign in, open the menu, navigate to every module, and the topbar doesn't overflow.

---

## Tier 2 — make the dense modules phone-friendly

Each module is independent; can be done in any order based on what users actually open on phones (likely Chat and Tasks first).

### 2.1 Chat — single-pane on mobile

- **File**: `src/app/(app)/chat/chat-view.tsx`.
- **Current state**: two-pane — `<div className="flex h-[calc(100vh-4rem)] overflow-hidden">` containing `<aside className="... w-72 ...">` (channel list) + `<main className="flex-1 ...">` (conversation). There is already a `channelsCollapsed` state for the desktop collapse feature.
- **What to do**:
  - On mobile, show **either** the channel list **or** the conversation, not both.
  - When no channel is selected (or via a back button), show the full-width channel list.
  - When a channel is open, show the full-width conversation with a back arrow in its header to return to the list.
  - Implement with responsive classes driven by "is a channel active": e.g. on mobile, channel list is `block` when none active and `hidden` when one is; conversation is the inverse. Desktop (`md:`) keeps both panes side by side as today.
  - Add the back button to the conversation header, `md:hidden`.

### 2.2 Tasks — default to List view on mobile

- **File**: `src/app/(app)/kanban/kanban-board.tsx`.
- **Current state**: `view` state is `"board" | "list"`, default `"board"`. Board is horizontal-scrolling fixed `w-80` columns. List view (grouped by student, already built) reads well on narrow screens. Drag-and-drop uses HTML5 DnD which is unreliable on touch (status can still be changed from the task detail dialog dropdown, so this is acceptable).
- **What to do**:
  - On first load, if viewport is `< md`, default `view` to `"list"`. Keep the toggle so users can still try the board.
  - Make the filter row wrap cleanly on mobile (it mostly does; verify `flex-wrap`).
  - Optionally: make task detail dialog full-screen on mobile (see 3.2).
  - Leave drag-drop as-is; document that status changes on mobile go through the task dialog.

### 2.3 Calendar — agenda fallback on mobile

- **File**: `src/app/(app)/calendar/calendar-view.tsx`.
- **Current state**: `view` is `"year" | "month" | "week" | "day"`. Month is a `grid-cols-7` grid; week/day are hour timetables (`TimeGrid`); year is a responsive mini-month grid. All are very tight on a phone.
- **What to do** (pick one approach):
  - **Cheaper**: on mobile default to **Day** view (the timetable is the only one that's legible at phone width) and let the user switch. Make the view toggle scrollable/condensed on mobile.
  - **Better**: add a fifth **Agenda** view — a simple chronological list of upcoming events/tasks grouped by day. Most phone-friendly. Default to it on mobile. More work (new render branch + the data is already in `dayEvents`).
  - Either way: make the header (prev/next/today/view-toggle/filters) wrap and shrink on mobile so it doesn't overflow.

---

## Tier 3 — polish (optional)

- **3.1 Tap targets**: bump small icon buttons to ≥ 40px touch area on mobile (currently many are ~28px). Affects dialogs, kanban card actions, calendar chips.
- **3.2 Bottom-sheet dialogs**: `src/components/ui/dialog.tsx` is already `w-[92vw] max-w-lg max-h-[90vh] overflow-y-auto` (reasonable). For a more native feel, on mobile dock dialogs to the bottom as a sheet (slide up, full width, rounded top corners) instead of centered.
- **3.3 Touch drag for the Tasks board**: replace HTML5 DnD with a pointer-event-based DnD lib (e.g. `@dnd-kit/core`) so the board is usable on touch. Non-trivial; only if users insist on the board on mobile.
- **3.4 Safe-area insets**: respect `env(safe-area-inset-*)` for notched phones (padding on the topbar and any bottom-docked UI). Pairs with the `viewportFit: "cover"` from 1.2.
- **3.5 PWA (optional, separate)**: add a web app manifest + icons so users can "Add to Home Screen". No service worker / offline needed; just installability. Small, independent task.

---

## Suggested sequencing

1. **Tier 1** (1.1 → 1.2 → 1.3) as one focused branch/PR. This is the make-or-break.
2. Ship, watch which modules users actually open on phones (check Vercel analytics / ask them).
3. **Tier 2** module by module, Chat and Tasks first.
4. **Tier 3** only if there's demand and time.

## Notes / gotchas for whoever implements this

- The dialog component (`src/components/ui/dialog.tsx`) was already made scroll-safe (`max-h-[90vh] overflow-y-auto`) — don't redo that.
- Sidebar and chat channel column already have desktop collapse state in localStorage; the mobile drawer is a *separate* concern — don't conflate "collapsed icons on desktop" with "drawer on mobile".
- Many list/card grids already use responsive `grid-cols-1 sm:grid-cols-2 lg:grid-cols-3` — those are fine, no work needed.
- Test at 375px (iPhone SE), 390px (iPhone 14), and 768px (the `md` boundary — make sure the desktop layout kicks in correctly there).
- The kanban board's horizontal scroll is acceptable on mobile if List view is the default; don't over-invest in making columns responsive.
- No backend changes are required for any tier — this is entirely a frontend/responsive effort.
