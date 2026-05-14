"use client";
import { useEffect, useState } from "react";
import { Calendar as CalIcon, Check, ExternalLink } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";

interface CalRow {
  id: string;
  summary: string;
  summaryOverride: string | null;
  backgroundColor: string;
  foregroundColor: string;
  primary: boolean;
  accessRole: string;
}

export function GoogleCalendarPicker({
  value,
  onChange,
}: {
  value: string | null;
  onChange: (calendarId: string | null, summary: string | null) => void;
}) {
  const [open, setOpen] = useState(false);
  const [calendars, setCalendars] = useState<CalRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    (async () => {
      setLoading(true);
      setError(null);
      const r = await fetch("/api/calendar/list");
      if (cancelled) return;
      setLoading(false);
      if (!r.ok) {
        const j = await r.json().catch(() => ({}));
        setError(j.error ?? "Could not load calendars");
        setCalendars([]);
        return;
      }
      const j = await r.json();
      setCalendars(j.calendars ?? []);
    })();
    return () => {
      cancelled = true;
    };
  }, [open]);

  const current = calendars.find((c) => c.id === value);

  return (
    <div className="flex flex-wrap items-center gap-2">
      <div className="flex-1 min-w-0">
        {value ? (
          <div className="flex items-center gap-2 rounded-lg border bg-slate-50 px-3 py-1.5 text-sm">
            <CalIcon className="h-3.5 w-3.5 text-[var(--c-teal)] shrink-0" />
            <span className="truncate font-medium text-slate-700">
              {current?.summary ?? value}
            </span>
            <a
              href={openCalendarUrl(value)}
              target="_blank"
              rel="noopener"
              className="text-xs text-[var(--c-teal)] hover:underline ml-auto flex items-center gap-1"
            >
              open <ExternalLink className="h-3 w-3" />
            </a>
          </div>
        ) : (
          <span className="text-xs text-slate-500 italic">
            No calendar linked (events will use your primary calendar)
          </span>
        )}
      </div>
      <Button type="button" variant="outline" size="sm" onClick={() => setOpen(true)}>
        <CalIcon className="h-4 w-4" /> Pick calendar
      </Button>
      {value && (
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={() => onChange(null, null)}
        >
          Clear
        </Button>
      )}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="!max-w-xl">
          <DialogHeader>
            <DialogTitle>Pick a Google Calendar</DialogTitle>
          </DialogHeader>

          <p className="text-xs text-slate-500 mb-3">
            New events for this student will be created on the chosen calendar.
            You only see calendars where you have <strong>writer</strong> access.
          </p>

          <div className="rounded-lg border bg-white max-h-72 overflow-y-auto">
            {error ? (
              <div className="p-4 text-sm text-[var(--c-red)] bg-red-50">{error}</div>
            ) : loading ? (
              <div className="p-4 space-y-2">
                {Array.from({ length: 4 }).map((_, i) => (
                  <div key={i} className="h-10 rounded shimmer" />
                ))}
              </div>
            ) : calendars.length === 0 ? (
              <div className="p-8 text-center text-sm text-slate-500">
                No writable calendars found.
              </div>
            ) : (
              <ul>
                {calendars.map((c) => (
                  <li key={c.id}>
                    <button
                      onClick={() => {
                        onChange(c.id, c.summary);
                        setOpen(false);
                      }}
                      className={cn(
                        "flex w-full items-center gap-3 px-3 py-2.5 text-sm hover:bg-slate-50 text-left",
                        c.id === value && "bg-slate-50",
                      )}
                    >
                      <span
                        className="h-3 w-3 rounded-sm shrink-0"
                        style={{ background: c.backgroundColor }}
                      />
                      <span className="flex-1 truncate">
                        <span className="font-medium text-slate-900">
                          {c.summary}
                        </span>
                        {c.primary && (
                          <span className="ml-2 text-[10px] uppercase font-semibold text-[var(--c-violet)]">
                            primary
                          </span>
                        )}
                        <span className="block text-[10px] text-slate-500 truncate">
                          {c.id}
                        </span>
                      </span>
                      {c.id === value && (
                        <Check className="h-4 w-4 text-[var(--c-green)]" />
                      )}
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <p className="text-[11px] text-slate-500 mt-3">
            Tip: to create a brand-new shared calendar for a student, open{" "}
            <a
              href="https://calendar.google.com/calendar/u/0/r/settings/createcalendar"
              target="_blank"
              rel="noopener"
              className="text-[var(--c-teal)] hover:underline"
            >
              Google Calendar → New calendar
            </a>
            , share it with the student, then pick it here.
          </p>

          <div className="flex justify-end pt-3 border-t mt-3">
            <Button type="button" variant="ghost" onClick={() => setOpen(false)}>
              Cancel
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

export function openCalendarUrl(calendarId: string): string {
  return `https://calendar.google.com/calendar/u/0/r?cid=${isoBase64(calendarId)}`;
}

/**
 * Base64-encode a string the same way on server and client. Server uses Buffer,
 * client uses btoa. For ASCII input (which calendar IDs always are), the two
 * produce identical output, so this is hydration-safe.
 */
function isoBase64(s: string): string {
  const encoded =
    typeof window === "undefined"
      ? Buffer.from(s, "utf8").toString("base64")
      : window.btoa(s);
  return encoded.replace(/=+$/, "");
}
