"use client";
import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import { Megaphone, Sparkles, Activity } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { relativeTime } from "@/lib/utils";

type Feed = {
  featureEnabled: boolean;
  userEnabled: boolean;
  show: boolean;
  appUpdates: { id: string; title: string; body: string; publishedAt: string }[];
  activity: { id: string; type: string; message: string; link: string | null; createdAt: string }[];
};

// Custom event any button can dispatch to open the News window on demand.
export const OPEN_NEWS_EVENT = "phdapp:open-news";

export function NewsGate() {
  const [feed, setFeed] = useState<Feed | null>(null);
  const [open, setOpen] = useState(false);

  const load = useCallback(async (autoOpen: boolean) => {
    try {
      const r = await fetch("/api/news", { cache: "no-store" });
      if (!r.ok) return;
      const j: Feed = await r.json();
      setFeed(j);
      if (autoOpen ? j.show : j.featureEnabled) setOpen(true);
    } catch {
      /* ignore */
    }
  }, []);

  // Auto-open once on mount when there's unseen news and it's enabled.
  useEffect(() => {
    void load(true);
  }, [load]);

  // Reopen on demand (topbar button), even when there's nothing new.
  useEffect(() => {
    const handler = () => {
      if (feed) setOpen(true);
      else void load(false);
    };
    window.addEventListener(OPEN_NEWS_EVENT, handler);
    return () => window.removeEventListener(OPEN_NEWS_EVENT, handler);
  }, [feed, load]);

  const dismiss = useCallback(async () => {
    setOpen(false);
    await fetch("/api/news", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "seen" }),
    }).catch(() => {});
  }, []);

  async function setAuto(enabled: boolean) {
    setFeed((f) => (f ? { ...f, userEnabled: enabled } : f));
    await fetch("/api/news", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: enabled ? "enable" : "disable" }),
    }).catch(() => {});
  }

  if (!feed) return null;
  const nothing = feed.appUpdates.length === 0 && feed.activity.length === 0;

  return (
    <Dialog open={open} onOpenChange={(o) => (o ? setOpen(true) : void dismiss())}>
      <DialogContent className="!max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Megaphone className="h-4 w-4 text-[var(--c-violet)]" /> News
          </DialogTitle>
        </DialogHeader>

        <div className="max-h-[60vh] space-y-5 overflow-y-auto">
          {nothing && (
            <p className="py-6 text-center text-sm text-slate-500">
              You&apos;re all caught up — nothing new since you last looked.
            </p>
          )}

          {feed.appUpdates.length > 0 && (
            <section>
              <h3 className="mb-2 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-slate-500">
                <Sparkles className="h-3.5 w-3.5 text-[var(--c-violet)]" /> What&apos;s new in PhDApp
              </h3>
              <ul className="space-y-2">
                {feed.appUpdates.map((p) => (
                  <li key={p.id} className="rounded-lg border bg-violet-50/40 p-3">
                    <div className="flex items-baseline justify-between gap-2">
                      <span className="font-semibold text-slate-900">{p.title}</span>
                      <span className="shrink-0 text-[11px] text-slate-400">
                        {relativeTime(p.publishedAt)}
                      </span>
                    </div>
                    <p className="mt-1 whitespace-pre-wrap text-sm text-slate-600">
                      {p.body}
                    </p>
                  </li>
                ))}
              </ul>
            </section>
          )}

          {feed.activity.length > 0 && (
            <section>
              <h3 className="mb-2 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-slate-500">
                <Activity className="h-3.5 w-3.5 text-[var(--c-teal)]" /> Recent activity
              </h3>
              <ul className="space-y-1">
                {feed.activity.map((a) => {
                  const inner = (
                    <div className="flex items-baseline justify-between gap-2 rounded-md px-2 py-1.5 hover:bg-slate-50">
                      <span className="text-sm text-slate-700">{a.message}</span>
                      <span className="shrink-0 text-[11px] text-slate-400">
                        {relativeTime(a.createdAt)}
                      </span>
                    </div>
                  );
                  return (
                    <li key={a.id}>
                      {a.link ? (
                        <Link href={a.link} onClick={() => void dismiss()}>
                          {inner}
                        </Link>
                      ) : (
                        inner
                      )}
                    </li>
                  );
                })}
              </ul>
            </section>
          )}
        </div>

        <div className="mt-3 flex items-center justify-between gap-2 border-t pt-3">
          <label className="flex items-center gap-2 text-xs text-slate-500">
            <input
              type="checkbox"
              checked={feed.userEnabled}
              onChange={(e) => void setAuto(e.target.checked)}
              className="h-4 w-4 rounded"
            />
            Show this automatically
          </label>
          <Button variant="brand" size="sm" onClick={() => void dismiss()}>
            Got it
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
