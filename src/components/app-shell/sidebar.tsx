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
  BookOpen,
  ChevronLeft,
  ChevronRight,
} from "lucide-react";
import { cn } from "@/lib/utils";

const COLLAPSE_KEY = "phdapp.sidebar-collapsed";

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
  { href: "/kanban", label: "Tasks", icon: KanbanSquare, color: "var(--c-orange)" },
  { href: "/calendar", label: "Calendar", icon: CalendarDays, color: "var(--c-teal)" },
  { href: "/reading", label: "Reading", icon: BookOpen, color: "var(--c-violet)" },
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
  const [collapsed, setCollapsed] = useState(false);
  useEffect(() => {
    if (typeof window === "undefined") return;
    setCollapsed(window.localStorage.getItem(COLLAPSE_KEY) === "1");
  }, []);
  function toggleCollapsed() {
    setCollapsed((prev) => {
      const next = !prev;
      try {
        window.localStorage.setItem(COLLAPSE_KEY, next ? "1" : "0");
      } catch {
        // ignore
      }
      return next;
    });
  }

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
    <aside
      className={cn(
        "hidden md:flex shrink-0 flex-col gap-1 border-r bg-white p-4 transition-[width] duration-200",
        collapsed ? "w-[72px]" : "w-60",
      )}
    >
      <Link
        href="/"
        className={cn(
          "flex items-center gap-2 py-2 mb-4",
          collapsed ? "justify-center px-0" : "px-2",
        )}
        title={collapsed ? "PhDapp · Supervision Hub" : undefined}
      >
        <div className="h-9 w-9 rounded-xl brand-bg flex items-center justify-center shadow-md shadow-violet-500/30 shrink-0">
          <Sparkles className="h-5 w-5 text-white" />
        </div>
        {!collapsed && (
          <div>
            <div className="text-base font-bold leading-tight brand-gradient">
              PhDapp
            </div>
            <div className="text-[10px] text-slate-500 leading-tight">
              Supervision Hub
            </div>
          </div>
        )}
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
          const unread =
            item.href === "/chat"
              ? unreadChat
              : item.href === "/kanban"
                ? unreadKanban
                : item.href === "/calendar"
                  ? unreadCalendar
                  : 0;
          const unreadColor =
            item.href === "/chat"
              ? "var(--c-pink)"
              : item.href === "/kanban"
                ? "var(--c-orange)"
                : "var(--c-teal)";
          const unreadLabel =
            item.href === "/chat"
              ? `${unread} unread message${unread === 1 ? "" : "s"}`
              : item.href === "/kanban"
                ? `${unread} new task change${unread === 1 ? "" : "s"}`
                : `${unread} new event change${unread === 1 ? "" : "s"}`;
          return (
            <Link
              key={item.href}
              href={item.href}
              title={collapsed ? (unread > 0 ? `${item.label} · ${unreadLabel}` : item.label) : undefined}
              className={cn(
                "group relative flex items-center rounded-lg text-sm font-medium transition-colors",
                collapsed ? "justify-center px-2 py-2" : "gap-3 px-3 py-2",
                active
                  ? "bg-slate-100 text-slate-900"
                  : "text-slate-600 hover:bg-slate-50 hover:text-slate-900",
              )}
            >
              <span
                className={cn(
                  "relative flex h-7 w-7 items-center justify-center rounded-md transition-colors shrink-0",
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
                {collapsed && unread > 0 && (
                  <span
                    className="absolute -top-1 -right-1 h-2.5 w-2.5 rounded-full border-2 border-white"
                    style={{ background: unreadColor }}
                  />
                )}
              </span>
              {!collapsed && (
                <>
                  {item.label}
                  {unread > 0 && (
                    <span
                      className="ml-auto inline-flex h-5 min-w-5 items-center justify-center rounded-full px-1.5 text-[10px] font-bold text-white"
                      style={{ background: unreadColor }}
                      title={unreadLabel}
                    >
                      {unread > 99 ? "99+" : unread}
                    </span>
                  )}
                  {active && unread === 0 && (
                    <span
                      className="absolute right-2 h-1.5 w-1.5 rounded-full"
                      style={{ background: item.color }}
                    />
                  )}
                </>
              )}
            </Link>
          );
        })}
      </nav>

      <div className="mt-auto space-y-0.5">
        {isAdmin && (
          <Link
            href="/admin"
            title={collapsed ? "Admin" : undefined}
            className={cn(
              "flex items-center rounded-lg text-sm font-medium hover:bg-slate-50",
              collapsed ? "justify-center px-2 py-2" : "gap-3 px-3 py-2",
              pathname.startsWith("/admin")
                ? "bg-red-50 text-[var(--c-red)]"
                : "text-[var(--c-red)]",
            )}
          >
            <Shield className="h-4 w-4" /> {!collapsed && "Admin"}
          </Link>
        )}
        {role !== "student" && (
        <Link
          href="/settings"
          title={collapsed ? "Settings" : undefined}
          className={cn(
            "flex items-center rounded-lg text-sm font-medium text-slate-600 hover:bg-slate-50",
            collapsed ? "justify-center px-2 py-2" : "gap-3 px-3 py-2",
            pathname.startsWith("/settings") && "bg-slate-100 text-slate-900",
          )}
        >
          <Settings className="h-4 w-4" /> {!collapsed && "Settings"}
        </Link>
        )}
        <button
          type="button"
          onClick={toggleCollapsed}
          title={collapsed ? "Expand sidebar" : "Collapse sidebar"}
          className={cn(
            "mt-2 flex w-full items-center rounded-lg text-xs text-slate-400 hover:bg-slate-50 hover:text-slate-600",
            collapsed ? "justify-center px-2 py-2" : "gap-2 px-3 py-2",
          )}
        >
          {collapsed ? (
            <ChevronRight className="h-4 w-4" />
          ) : (
            <>
              <ChevronLeft className="h-4 w-4" /> Collapse
            </>
          )}
        </button>
      </div>
    </aside>
  );
}
