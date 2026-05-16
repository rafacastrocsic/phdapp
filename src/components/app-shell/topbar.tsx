import { Plus } from "lucide-react";
import Link from "next/link";
import { Avatar } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { UserMenu } from "./user-menu";
import { NotificationBell } from "./notification-bell";
import { GlobalSearch } from "./global-search";

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
    <header className="sticky top-0 z-30 flex h-16 items-center gap-4 border-b bg-white/80 backdrop-blur px-6 print:hidden">
      <div className="flex flex-1 items-center gap-3">
        <GlobalSearch />
      </div>

      <div className="flex items-center gap-3">
        {!isStudent && (
          <Link href="/kanban?new=1">
            <Button variant="brand" size="sm">
              <Plus className="h-4 w-4" /> New task
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
            className="flex items-center gap-2 rounded-full border bg-slate-50 py-1 pl-1 pr-3 cursor-pointer hover:bg-slate-100 transition-colors text-left"
          >
            <Avatar
              name={user.name ?? user.email ?? "?"}
              src={user.image}
              color={user.color ?? "#6366f1"}
              size="sm"
            />
            <div className="leading-tight">
              <div className="text-xs font-semibold text-slate-900">
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
