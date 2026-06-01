"use client";
import { Menu } from "lucide-react";
import { useMobileNav } from "@/components/app-shell/mobile-nav-context";

/**
 * Hamburger button that opens the mobile nav drawer.
 *
 * Lives in the topbar but is its own client component because the
 * Topbar itself is a server component and shouldn't pull in React
 * context. Only visible below md — on desktop the sidebar is always
 * inline so there's nothing to toggle.
 */
export function TopbarMenuButton() {
  const { toggle } = useMobileNav();
  return (
    <button
      type="button"
      onClick={toggle}
      title="Open menu"
      aria-label="Open menu"
      className="inline-flex h-9 w-9 items-center justify-center rounded-lg text-slate-600 hover:bg-slate-100 hover:text-slate-900 md:hidden"
    >
      <Menu className="h-5 w-5" />
    </button>
  );
}
