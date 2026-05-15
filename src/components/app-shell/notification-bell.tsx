"use client";
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Bell } from "lucide-react";
import { cn, relativeTime } from "@/lib/utils";

interface Notif {
  id: string;
  type: string;
  message: string;
  link: string | null;
  read: boolean;
  createdAt: string;
}

export function NotificationBell() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<Notif[]>([]);
  const [unread, setUnread] = useState(0);
  const ref = useRef<HTMLDivElement>(null);

  async function load() {
    try {
      const r = await fetch("/api/notifications", { cache: "no-store" });
      if (r.ok) {
        const j = await r.json();
        setItems(j.items);
        setUnread(j.unread);
      }
    } catch {
      /* ignore */
    }
  }

  useEffect(() => {
    load();
    const t = setInterval(load, 30000);
    return () => clearInterval(t);
  }, []);

  useEffect(() => {
    function onClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node))
        setOpen(false);
    }
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, []);

  async function markAll() {
    setUnread(0);
    setItems((p) => p.map((i) => ({ ...i, read: true })));
    await fetch("/api/notifications", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ all: true }),
    });
  }
  async function openItem(n: Notif) {
    await fetch("/api/notifications", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: n.id }),
    });
    setOpen(false);
    if (n.link) router.push(n.link);
    else load();
  }

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="relative flex h-9 w-9 items-center justify-center rounded-full border bg-slate-50 hover:bg-slate-100"
        title="Notifications"
      >
        <Bell className="h-4 w-4 text-slate-600" />
        {unread > 0 && (
          <span className="absolute -top-1 -right-1 inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-[var(--c-red)] px-1 text-[10px] font-bold text-white">
            {unread > 99 ? "99+" : unread}
          </span>
        )}
      </button>
      {open && (
        <div className="absolute right-0 mt-2 w-80 rounded-xl border bg-white shadow-lg z-50">
          <div className="flex items-center justify-between px-3 py-2 border-b">
            <span className="text-sm font-semibold text-slate-900">
              Notifications
            </span>
            {unread > 0 && (
              <button
                type="button"
                onClick={markAll}
                className="text-xs text-[var(--c-violet)] hover:underline"
              >
                Mark all read
              </button>
            )}
          </div>
          <div className="max-h-96 overflow-y-auto">
            {items.length === 0 ? (
              <p className="p-6 text-center text-sm text-slate-400">
                Nothing yet.
              </p>
            ) : (
              <ul className="divide-y">
                {items.map((n) => (
                  <li key={n.id}>
                    <button
                      type="button"
                      onClick={() => openItem(n)}
                      className={cn(
                        "block w-full px-3 py-2 text-left hover:bg-slate-50",
                        !n.read && "bg-violet-50/50",
                      )}
                    >
                      <div className="text-sm text-slate-800">{n.message}</div>
                      <div className="text-[10px] text-slate-400 mt-0.5">
                        {relativeTime(new Date(n.createdAt))}
                      </div>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
