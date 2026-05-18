"use client";
import { useEffect, useState } from "react";
import { CalendarDays } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export function GeneralCalendarSetting() {
  const [value, setValue] = useState("");
  const [normalized, setNormalized] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<{ type: "ok" | "err"; text: string } | null>(
    null,
  );

  useEffect(() => {
    let cancelled = false;
    fetch("/api/admin/general-calendar")
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => {
        if (cancelled || !j) return;
        setValue(j.value ?? "");
        setNormalized(j.normalized ?? null);
        setLoaded(true);
      })
      .catch(() => setLoaded(true));
    return () => {
      cancelled = true;
    };
  }, []);

  async function save() {
    setSaving(true);
    setMsg(null);
    const r = await fetch("/api/admin/general-calendar", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ value }),
    });
    setSaving(false);
    const j = await r.json().catch(() => ({}));
    if (!r.ok) {
      setMsg({ type: "err", text: j.error ?? "Could not save." });
      return;
    }
    setNormalized(j.normalized ?? null);
    setMsg({
      type: "ok",
      text: j.normalized
        ? `Saved. Unassigned events & tasks will sync to ${j.normalized}.`
        : "Cleared — unassigned items fall back to the creator's primary calendar.",
    });
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <CalendarDays className="h-5 w-5 text-[var(--c-teal)]" />
          General calendar
        </CardTitle>
        <p className="text-sm text-slate-500">
          Google Calendar used for <strong>unassigned events</strong> and for
          tasks whose student has no shared calendar. Paste a calendar ID
          (e.g. <code>abc123@group.calendar.google.com</code>) or a Google
          Calendar share/embed URL. Leave empty to fall back to the event
          creator&apos;s own primary calendar. The calendar must be shared
          with edit access to the account that pushes events.
        </p>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="flex flex-wrap gap-2">
          <Input
            value={value}
            onChange={(e) => setValue(e.target.value)}
            placeholder={
              loaded ? "…@group.calendar.google.com" : "Loading…"
            }
            disabled={!loaded || saving}
            className="flex-1 min-w-[16rem]"
          />
          <Button
            type="button"
            variant="brand"
            onClick={save}
            disabled={!loaded || saving}
          >
            {saving ? "Saving…" : "Save"}
          </Button>
        </div>
        {normalized && (
          <p className="text-xs text-slate-500">
            Resolved calendar ID: <code>{normalized}</code>
          </p>
        )}
        {msg && (
          <div
            className={
              msg.type === "ok"
                ? "text-sm text-[var(--c-green)] bg-green-50 rounded-lg p-3"
                : "text-sm text-[var(--c-red)] bg-red-50 rounded-lg p-3"
            }
          >
            {msg.text}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
