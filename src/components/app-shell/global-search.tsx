"use client";
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Search } from "lucide-react";
import { Avatar } from "@/components/ui/avatar";

interface Results {
  students: { id: string; name: string; email: string; color: string }[];
  tasks: { id: string; title: string; status: string; student: string }[];
  events: { id: string; title: string; startsAt: string; ticketId: string | null }[];
}
const EMPTY: Results = { students: [], tasks: [], events: [] };

export function GlobalSearch() {
  const router = useRouter();
  const [q, setQ] = useState("");
  const [res, setRes] = useState<Results>(EMPTY);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const boxRef = useRef<HTMLDivElement>(null);

  // Debounced fetch.
  useEffect(() => {
    const term = q.trim();
    if (term.length < 2) {
      setRes(EMPTY);
      setLoading(false);
      return;
    }
    setLoading(true);
    const ctrl = new AbortController();
    const t = setTimeout(async () => {
      try {
        const r = await fetch(`/api/search?q=${encodeURIComponent(term)}`, {
          signal: ctrl.signal,
          cache: "no-store",
        });
        if (r.ok) {
          setRes(await r.json());
          setOpen(true);
        }
      } catch {
        /* aborted / transient */
      } finally {
        setLoading(false);
      }
    }, 250);
    return () => {
      clearTimeout(t);
      ctrl.abort();
    };
  }, [q]);

  // Close on outside click.
  useEffect(() => {
    function onDoc(e: MouseEvent) {
      if (boxRef.current && !boxRef.current.contains(e.target as Node))
        setOpen(false);
    }
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, []);

  function go(href: string) {
    setOpen(false);
    setQ("");
    setRes(EMPTY);
    router.push(href);
  }

  const total =
    res.students.length + res.tasks.length + res.events.length;
  const showPanel = open && q.trim().length >= 2;

  return (
    <div ref={boxRef} className="relative max-w-md flex-1">
      <Search className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
      <input
        value={q}
        onChange={(e) => setQ(e.target.value)}
        onFocus={() => q.trim().length >= 2 && setOpen(true)}
        onKeyDown={(e) => {
          if (e.key === "Escape") setOpen(false);
        }}
        placeholder="Search students, tasks, events…"
        className="h-9 w-full rounded-lg border bg-slate-50 pl-9 pr-3 text-sm placeholder:text-slate-400 focus:bg-white focus:outline-none focus:ring-2 focus:ring-[var(--ring)]/20"
      />

      {showPanel && (
        <div className="absolute left-0 right-0 top-11 z-40 max-h-[70vh] overflow-auto rounded-xl border bg-white shadow-lg">
          {loading && total === 0 ? (
            <p className="px-3 py-3 text-sm text-slate-400">Searching…</p>
          ) : total === 0 ? (
            <p className="px-3 py-3 text-sm text-slate-400">
              No matches for “{q.trim()}”.
            </p>
          ) : (
            <div className="py-1">
              {res.students.length > 0 && (
                <Group label="Students">
                  {res.students.map((s) => (
                    <button
                      key={s.id}
                      type="button"
                      onClick={() => go(`/students/${s.id}`)}
                      className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-sm hover:bg-slate-50"
                    >
                      <Avatar name={s.name} color={s.color} size="xs" />
                      <span className="font-medium text-slate-800 truncate">
                        {s.name}
                      </span>
                      <span className="text-xs text-slate-400 truncate">
                        {s.email}
                      </span>
                    </button>
                  ))}
                </Group>
              )}
              {res.tasks.length > 0 && (
                <Group label="Tasks">
                  {res.tasks.map((t) => (
                    <button
                      key={t.id}
                      type="button"
                      onClick={() => go(`/kanban?ticket=${t.id}`)}
                      className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-sm hover:bg-slate-50"
                    >
                      <span className="text-slate-800 truncate flex-1">
                        {t.title}
                      </span>
                      <span className="text-[10px] text-slate-400 shrink-0">
                        {t.student} · {t.status.replace("_", " ")}
                      </span>
                    </button>
                  ))}
                </Group>
              )}
              {res.events.length > 0 && (
                <Group label="Events">
                  {res.events.map((e) => (
                    <button
                      key={e.id}
                      type="button"
                      onClick={() =>
                        go(
                          e.ticketId
                            ? `/kanban?ticket=${e.ticketId}`
                            : "/calendar",
                        )
                      }
                      className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-sm hover:bg-slate-50"
                    >
                      <span className="text-slate-800 truncate flex-1">
                        {e.title}
                      </span>
                      <span className="text-[10px] text-slate-400 shrink-0">
                        {new Date(e.startsAt).toLocaleDateString()}
                      </span>
                    </button>
                  ))}
                </Group>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function Group({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="py-1">
      <div className="px-3 pb-0.5 text-[10px] font-semibold uppercase tracking-wide text-slate-400">
        {label}
      </div>
      {children}
    </div>
  );
}
