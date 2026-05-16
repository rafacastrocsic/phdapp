"use client";
import { useState } from "react";
import { Lightbulb, Send, Trash2 } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Avatar } from "@/components/ui/avatar";
import { relativeTime } from "@/lib/utils";

interface Author {
  id: string;
  name: string | null;
  image: string | null;
  color: string;
}
interface TaggedStudent {
  id: string;
  name: string;
  color: string;
}
interface Suggestion {
  id: string;
  body: string;
  createdAt: string;
  author: Author;
  students: TaggedStudent[];
}
interface StudentOpt {
  id: string;
  name: string;
  color: string;
}

export function AdvisorSuggestions({
  viewerId,
  canPost,
  isAdmin,
  students,
  initial,
}: {
  viewerId: string;
  canPost: boolean;
  isAdmin: boolean;
  students: StudentOpt[];
  initial: Suggestion[];
}) {
  const [items, setItems] = useState<Suggestion[]>(initial);
  const [draft, setDraft] = useState("");
  const [tagged, setTagged] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);

  function toggle(id: string) {
    setTagged((p) => (p.includes(id) ? p.filter((x) => x !== id) : [...p, id]));
  }

  async function add() {
    const body = draft.trim();
    if (!body) return;
    setBusy(true);
    const r = await fetch("/api/team/suggestions", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ body, studentIds: tagged }),
    });
    setBusy(false);
    if (r.ok) {
      const me = { id: viewerId, name: "You", image: null, color: "#0ea5e9" };
      const tags = students
        .filter((s) => tagged.includes(s.id))
        .map((s) => ({ id: s.id, name: s.name, color: s.color }));
      const { id } = await r.json();
      setItems((p) => [
        {
          id,
          body,
          createdAt: new Date().toISOString(),
          author: me,
          students: tags,
        },
        ...p,
      ]);
      setDraft("");
      setTagged([]);
    }
  }
  async function remove(id: string) {
    if (!confirm("Delete this suggestion?")) return;
    setItems((p) => p.filter((s) => s.id !== id));
    await fetch(`/api/team/suggestions/${id}`, { method: "DELETE" });
  }

  return (
    <Card className="border-sky-200">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-sky-700">
          <Lightbulb className="h-4 w-4" />
          Advisor suggestions
        </CardTitle>
        <p className="text-[11px] text-sky-700/80 mt-1">
          {canPost
            ? "Send suggestions to the supervisors — tag one or more students, or leave untagged for a general note."
            : "Suggestions from the team advisors. Tagged students are shown; untagged ones are general."}
        </p>
      </CardHeader>
      <CardContent className="space-y-4">
        {canPost && (
          <div className="space-y-2 border-b pb-3">
            <textarea
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              placeholder="Your suggestion to the supervisors…"
              rows={3}
              className="w-full rounded-lg border bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-sky-300/40 resize-y"
            />
            {students.length > 0 && (
              <div className="flex flex-wrap gap-1.5">
                {students.map((s) => {
                  const on = tagged.includes(s.id);
                  return (
                    <button
                      key={s.id}
                      type="button"
                      onClick={() => toggle(s.id)}
                      className="rounded-full border px-2 py-0.5 text-[11px] transition-colors"
                      style={
                        on
                          ? { background: s.color, color: "white", borderColor: s.color }
                          : { color: "#475569" }
                      }
                    >
                      {s.name}
                    </button>
                  );
                })}
              </div>
            )}
            <div className="flex items-center justify-between">
              <span className="text-[10px] text-slate-400">
                {tagged.length === 0
                  ? "No students tagged — general suggestion"
                  : `${tagged.length} student${tagged.length === 1 ? "" : "s"} tagged`}
              </span>
              <Button
                type="button"
                size="sm"
                variant="brand"
                onClick={add}
                disabled={busy || !draft.trim()}
              >
                <Send className="h-3.5 w-3.5" /> Send
              </Button>
            </div>
          </div>
        )}

        {items.length === 0 ? (
          <p className="text-sm text-slate-400">No suggestions yet.</p>
        ) : (
          <ul className="space-y-2">
            {items.map((s) => (
              <li
                key={s.id}
                className="group rounded-lg border bg-sky-50/40 p-3"
              >
                <div className="flex items-center gap-2 mb-1">
                  <Avatar
                    name={s.author.name}
                    src={s.author.image}
                    color={s.author.color}
                    size="xs"
                  />
                  <span className="text-xs font-medium text-slate-700">
                    {s.author.name ?? "Unknown"}
                  </span>
                  <span className="text-[10px] text-slate-400">
                    {relativeTime(new Date(s.createdAt))}
                  </span>
                  {(s.author.id === viewerId || isAdmin) && (
                    <button
                      type="button"
                      onClick={() => remove(s.id)}
                      className="ml-auto text-slate-300 hover:text-[var(--c-red)] opacity-0 group-hover:opacity-100 transition-opacity"
                      title="Delete suggestion"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  )}
                </div>
                <p className="text-sm text-slate-700 whitespace-pre-wrap break-words">
                  {s.body}
                </p>
                <div className="mt-1.5 flex flex-wrap gap-1">
                  {s.students.length === 0 ? (
                    <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] text-slate-500">
                      General
                    </span>
                  ) : (
                    s.students.map((st) => (
                      <span
                        key={st.id}
                        className="rounded-full px-2 py-0.5 text-[10px] text-white"
                        style={{ background: st.color }}
                      >
                        {st.name}
                      </span>
                    ))
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
