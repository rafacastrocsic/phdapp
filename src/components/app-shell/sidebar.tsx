"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard,
  Users,
  KanbanSquare,
  CalendarDays,
  FolderOpen,
  MessagesSquare,
  Settings,
  Sparkles,
  GraduationCap,
  ScrollText,
  Shield,
} from "lucide-react";
import { cn } from "@/lib/utils";

type Nav = {
  href: string;
  label: string;
  icon: typeof LayoutDashboard;
  color: string;
  hideFor?: ("admin" | "supervisor" | "student")[];
};

const NAV: Nav[] = [
  { href: "/", label: "Dashboard", icon: LayoutDashboard, color: "var(--c-violet)" },
  { href: "/students", label: "Students", icon: GraduationCap, color: "var(--c-pink)", hideFor: ["student"] },
  { href: "/kanban", label: "Kanban", icon: KanbanSquare, color: "var(--c-orange)" },
  { href: "/calendar", label: "Calendar", icon: CalendarDays, color: "var(--c-teal)" },
  { href: "/files", label: "Files", icon: FolderOpen, color: "var(--c-blue)" },
  { href: "/chat", label: "Chat", icon: MessagesSquare, color: "var(--c-green)" },
  { href: "/log", label: "Log book", icon: ScrollText, color: "var(--c-red)" },
  { href: "/team", label: "Team", icon: Users, color: "var(--c-yellow)", hideFor: ["student"] },
];

export function Sidebar({
  role,
  showLog = true,
  unreadChat: initialUnread = 0,
  unreadKanban: initialUnreadKanban = 0,
  unreadCalendar: initialUnreadCalendar = 0,
}: {
  role?: string;
  showLog?: boolean;
  unreadChat?: number;
  unreadKanban?: number;
  unreadCalendar?: number;
}) {
  const pathname = usePathname();
  const isAdmin = role === "admin";
  const [unreadChat, setUnreadChat] = useState(initialUnread);
  const [unreadKanban, setUnreadKanban] = useState(initialUnreadKanban);
  const [unreadCalendar, setUnreadCalendar] = useState(initialUnreadCalendar);

  useEffect(() => {
    let cancelled = false;

    async function fetchCounts() {
      const [chat, kanban, calendar] = await Promise.all([
        fetch("/api/chat/unread", { cache: "no-store" }),
        fetch("/api/kanban/unread", { cache: "no-store" }),
        fetch("/api/calendar/unread", { cache: "no-store" }),
      ]);
      if (!cancelled && chat.ok) {
        const j = await chat.json();
        setUnreadChat(j.count ?? 0);
      }
      if (!cancelled && kanban.ok) {
        const j = await kanban.json();
        setUnreadKanban(j.count ?? 0);
      }
      if (!cancelled && calendar.ok) {
        const j = await calendar.json();
        setUnreadCalendar(j.count ?? 0);
      }
    }

    fetchCounts();
    // faster cadence on active sections
    const onChat = pathname.startsWith("/chat");
    const onKanban = pathname.startsWith("/kanban");
    const onCalendar = pathname.startsWith("/calendar");
    const interval = onChat || onKanban || onCalendar ? 4000 : 5000;
    const t = setInterval(fetchCounts, interval);
    return () => {
      cancelled = true;
      clearInterval(t);
    };
  }, [pathname]);
  return (
    <aside className="hidden md:flex w-60 shrink-0 flex-col gap-1 border-r bg-white p-4">
      <Link href="/" className="flex items-center gap-2 px-2 py-2 mb-4">
        <div className="h-9 w-9 rounded-xl brand-bg flex items-center justify-center shadow-md shadow-violet-500/30">
          <Sparkles className="h-5 w-5 text-white" />
        </div>
        <div>
          <div className="text-base font-bold leading-tight brand-gradient">
            PhDapp
          </div>
          <div className="text-[10px] text-slate-500 leading-tight">
            Supervision Hub
          </div>
        </div>
      </Link>

      <nav className="flex flex-col gap-0.5">
        {NAV.filter((item) => {
          if (item.href === "/log" && !showLog) return false;
          if (item.hideFor && role && (item.hideFor as string[]).includes(role))
            return false;
          return true;
        }).map((item) => {
          const active =
            item.href === "/"
              ? pathname === "/"
              : pathname.startsWith(item.href);
          const Icon = item.icon;
          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                "group relative flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors",
                active
                  ? "bg-slate-100 text-slate-900"
                  : "text-slate-600 hover:bg-slate-50 hover:text-slate-900",
              )}
            >
              <span
                className={cn(
                  "flex h-7 w-7 items-center justify-center rounded-md transition-colors",
                  active ? "text-white" : "text-slate-500 group-hover:text-slate-700",
                )}
                style={
                  active ? { background: item.color } : { background: `${item.color}1f` }
                }
              >
                <Icon
                  className="h-4 w-4"
                  style={!active ? { color: item.color } : undefined}
                />
              </span>
              {item.label}
              {item.href === "/chat" && unreadChat > 0 && (
                <span
                  className="ml-auto inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-[var(--c-pink)] px-1.5 text-[10px] font-bold text-white"
                  title={`${unreadChat} unread message${unreadChat === 1 ? "" : "s"}`}
                >
                  {unreadChat > 99 ? "99+" : unreadChat}
                </span>
              )}
              {item.href === "/kanban" && unreadKanban > 0 && (
                <span
                  className="ml-auto inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-[var(--c-orange)] px-1.5 text-[10px] font-bold text-white"
                  title={`${unreadKanban} new ticket change${unreadKanban === 1 ? "" : "s"}`}
                >
                  {unreadKanban > 99 ? "99+" : unreadKanban}
                </span>
              )}
              {item.href === "/calendar" && unreadCalendar > 0 && (
                <span
                  className="ml-auto inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-[var(--c-teal)] px-1.5 text-[10px] font-bold text-white"
                  title={`${unreadCalendar} new event change${unreadCalendar === 1 ? "" : "s"}`}
                >
                  {unreadCalendar > 99 ? "99+" : unreadCalendar}
                </span>
              )}
              {active &&
                item.href !== "/chat" &&
                item.href !== "/kanban" &&
                item.href !== "/calendar" && (
                <span
                  className="absolute right-2 h-1.5 w-1.5 rounded-full"
                  style={{ background: item.color }}
                />
              )}
            </Link>
          );
        })}
      </nav>

      <div className="mt-auto space-y-0.5">
        {isAdmin && (
          <Link
            href="/admin"
            className={cn(
              "flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium hover:bg-slate-50",
              pathname.startsWith("/admin")
                ? "bg-red-50 text-[var(--c-red)]"
                : "text-[var(--c-red)]",
            )}
          >
            <Shield className="h-4 w-4" /> Admin
          </Link>
        )}
        {role !== "student" && (
        <Link
          href="/settings"
          className={cn(
            "flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium text-slate-600 hover:bg-slate-50",
            pathname.startsWith("/settings") && "bg-slate-100 text-slate-900",
          )}
        >
          <Settings className="h-4 w-4" /> Settings
        </Link>
        )}
      </div>
    </aside>
  );
}
