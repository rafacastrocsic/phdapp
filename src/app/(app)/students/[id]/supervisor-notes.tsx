"use client";
import { useState } from "react";
import { Lock, Trash2, Send } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Avatar } from "@/components/ui/avatar";
import { relativeTime } from "@/lib/utils";

interface NoteAuthor {
  id: string;
  name: string | null;
  image: string | null;
  color: string;
}
interface Note {
  id: string;
  body: string;
  createdAt: string;
  author: NoteAuthor;
}

export function SupervisorNotes({
  studentId,
  viewerId,
  isAdmin,
  initialNotes,
}: {
  studentId: string;
  viewerId: string;
  isAdmin: boolean;
  initialNotes: Note[];
}) {
  const [notes, setNotes] = useState<Note[]>(initialNotes);
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);

  async function add() {
    const body = draft.trim();
    if (!body) return;
    setBusy(true);
    const r = await fetch(`/api/students/${studentId}/notes`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ body }),
    });
    setBusy(false);
    if (r.ok) {
      const { note } = await r.json();
      setNotes((p) => [note, ...p]);
      setDraft("");
    }
  }
  async function remove(id: string) {
    if (!confirm("Delete this note?")) return;
    setNotes((p) => p.filter((n) => n.id !== id));
    await fetch(`/api/students/${studentId}/notes/${id}`, { method: "DELETE" });
  }

  return (
    <Card className="border-amber-200">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-amber-700">
          <Lock className="h-4 w-4" />
          Private supervisor notes
        </CardTitle>
        <p className="text-[11px] text-amber-700/80 mt-1">
          Visible to supervisors only — not the student, external advisors, or
          committee members.
        </p>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="flex gap-2">
          <textarea
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            placeholder="Add an internal note…"
            rows={2}
            className="flex-1 rounded-lg border bg-white px-3 py-2 text-sm placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-amber-300/40 resize-y"
          />
          <Button
            type="button"
            variant="brand"
            size="sm"
            onClick={add}
            disabled={busy || !draft.trim()}
            className="self-end"
          >
            <Send className="h-3.5 w-3.5" /> Post
          </Button>
        </div>
        {notes.length === 0 ? (
          <p className="text-sm text-slate-400">No notes yet.</p>
        ) : (
          <ul className="space-y-2">
            {notes.map((n) => {
              const canDelete = n.author.id === viewerId || isAdmin;
              return (
                <li
                  key={n.id}
                  className="group rounded-lg border bg-amber-50/40 p-3"
                >
                  <div className="flex items-center gap-2 mb-1">
                    <Avatar
                      name={n.author.name}
                      src={n.author.image}
                      color={n.author.color}
                      size="xs"
                    />
                    <span className="text-xs font-medium text-slate-700">
                      {n.author.name ?? "Unknown"}
                    </span>
                    <span className="text-[10px] text-slate-400">
                      {relativeTime(new Date(n.createdAt))}
                    </span>
                    {canDelete && (
                      <button
                        type="button"
                        onClick={() => remove(n.id)}
                        className="ml-auto text-slate-300 hover:text-[var(--c-red)] opacity-0 group-hover:opacity-100 transition-opacity"
                        title="Delete note"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    )}
                  </div>
                  <p className="text-sm text-slate-700 whitespace-pre-wrap break-words">
                    {n.body}
                  </p>
                </li>
              );
            })}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
