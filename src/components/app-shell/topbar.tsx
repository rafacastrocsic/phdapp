import { Plus } from "lucide-react";
import Link from "next/link";
import { Avatar } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { UserMenu } from "./user-menu";
import { NotificationBell } from "./notification-bell";
import { GlobalSearch } from "./global-search";
import { TopbarMenuButton } from "./topbar-menu-button";

interface TopbarProps {
  user: {
    id: string;
    name?: string | null;
    email?: string | null;
    image?: string | null;
    role?: string;
    color?: string;
  };
  studentId?: string | null;
}

const roleStyle: Record<string, { label: string; color: string }> = {
  admin: { label: "Admin", color: "#e2445c" },
  supervisor: { label: "Supervisor", color: "#6f4cff" },
  student: { label: "PhD student", color: "#ff7a45" },
};

export function Topbar({ user, studentId = null }: TopbarProps) {
  const role = roleStyle[user.role ?? "student"];
  const isStudent = user.role === "student";
  const profileHref = isStudent && studentId ? `/students/${studentId}` : "/settings";

  return (
    // px-4 on mobile, px-6 at md+. Lower z-index than the mobile
    // nav drawer (z-50) and its backdrop (z-40) so the drawer sits
    // on top when open.
    //
    // Padding-top respects env(safe-area-inset-top) so the topbar
    // doesn't disappear under the notch when the app is installed
    // as a PWA on a notched iPhone (the viewportFit: "cover" set on
    // the root layout opens the rendering area into that zone).
    <header
      className="sticky top-0 z-30 flex h-16 items-center gap-2 border-b bg-white/80 backdrop-blur px-4 sm:gap-3 md:gap-4 md:px-6 print:hidden"
      style={{ paddingTop: "env(safe-area-inset-top)" }}
    >
      {/* Hamburger — toggles the mobile nav drawer. Hidden on
          desktop; the sidebar is always visible there. */}
      <TopbarMenuButton />

      <div className="flex flex-1 items-center gap-3 min-w-0">
        {/* Search box: hide entirely on the smallest viewports —
            it's a non-critical placeholder and would crowd the row
            on mobile. */}
        <div className="hidden flex-1 sm:flex min-w-0">
          <GlobalSearch />
        </div>
      </div>

      <div className="flex items-center gap-2 sm:gap-3">
        {!isStudent && (
          <Link href="/kanban?new=1">
            <Button variant="brand" size="sm" title="New task">
              <Plus className="h-4 w-4" />
              {/* Hide the label on mobile — keep the + alone. */}
              <span className="hidden sm:inline">New task</span>
            </Button>
          </Link>
        )}
        <NotificationBell />
        <UserMenu
          profileHref={profileHref}
          profileLabel={isStudent ? "Edit my profile" : "Settings"}
          showSettings={!isStudent}
        >
          <button
            type="button"
            className="flex items-center gap-2 rounded-full border bg-slate-50 py-1 pl-1 sm:pr-3 pr-1 cursor-pointer hover:bg-slate-100 transition-colors text-left max-w-[60vw] sm:max-w-none"
          >
            <Avatar
              name={user.name ?? user.email ?? "?"}
              src={user.image}
              color={user.color ?? "#6366f1"}
              size="sm"
            />
            {/* Name + role badge hidden on the smallest screens to
                avoid the user chip eating the entire topbar row;
                tap-to-open the user menu still works on the avatar. */}
            <div className="hidden sm:block leading-tight min-w-0">
              <div className="text-xs font-semibold text-slate-900 truncate max-w-[12rem]">
                {user.name ?? user.email}
              </div>
              <Badge color={role.color} className="!py-0 !text-[10px]">
                {role.label}
              </Badge>
            </div>
          </button>
        </UserMenu>
      </div>
    </header>
  );
}
