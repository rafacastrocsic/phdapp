"use client";
import { Menu } from "lucide-react";
import { useMobileNav } from "@/components/app-shell/mobile-nav-context";
import { useUnread } from "@/components/app-shell/unread-provider";

/**
 * Hamburger button that opens the mobile nav drawer.
 *
 * Lives in the topbar but is its own client component because the
 * Topbar itself is a server component and shouldn't pull in React
 * context. Only visible below md — on desktop the sidebar is always
 * inline so there's nothing to toggle.
 *
 * Carries a small red dot whenever ANY module has unread items —
 * a single "you have new things" cue without surfacing per-module
 * counts (those reveal themselves when the user opens the drawer).
 * Without this, on mobile the user would see no nav-level signal
 * that anything's new, since the sidebar badges are hidden behind
 * the drawer.
 */
export function TopbarMenuButton() {
  const { toggle } = useMobileNav();
  const { data } = useUnread();
  const anyUnread =
    (data?.chat?.count ?? 0) +
      (data?.kanban?.count ?? 0) +
      (data?.calendar?.count ?? 0) +
      (data?.reading?.count ?? 0) +
      (data?.team?.count ?? 0) +
      (data?.feedback?.count ?? 0) >
    0;
  return (
    <button
      type="button"
      onClick={toggle}
      title={anyUnread ? "Open menu · unread items" : "Open menu"}
      aria-label="Open menu"
      className="relative inline-flex h-9 w-9 items-center justify-center rounded-lg text-slate-600 hover:bg-slate-100 hover:text-slate-900 md:hidden"
    >
      <Menu className="h-5 w-5" />
      {anyUnread && (
        <span
          aria-hidden
          className="absolute right-1.5 top-1.5 h-2 w-2 rounded-full bg-[var(--c-pink)] ring-2 ring-white"
        />
      )}
    </button>
  );
}
