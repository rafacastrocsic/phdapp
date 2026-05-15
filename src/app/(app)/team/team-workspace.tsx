"use client";
import { useState } from "react";
import { FolderOpen, Lock, Send, Trash2, Pencil } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Avatar } from "@/components/ui/avatar";
import { relativeTime } from "@/lib/utils";

interface Author {
  id: string;
  name: string | null;
  image: string | null;
  color: string;
}
interface Note {
  id: string;
  body: string;
  createdAt: string;
  author: Author;
}

export function TeamWorkspace({
  viewerId,
  isAdmin,
  initialFolder,
  initialNotes,
}: {
  viewerId: string;
  isAdmin: boolean;
  initialFolder: string | null;
  initialNotes: Note[];
}) {
  const [folder, setFolder] = useState(initialFolder);
  const [editingFolder, setEditingFolder] = useState(false);
  const [folderDraft, setFolderDraft] = useState(initialFolder ?? "");
  const [notes, setNotes] = useState<Note[]>(initialNotes);
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);

  async function saveFolder() {
    const r = await fetch("/api/team/workspace", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ url: folderDraft.trim() }),
    });
    if (r.ok) {
      setFolder(folderDraft.trim() || null);
      setEditingFolder(false);
    }
  }
  async function add() {
    const body = draft.trim();
    if (!body) return;
    setBusy(true);
    const r = await fetch("/api/team/notes", {
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
    await fetch(`/api/team/notes/${id}`, { method: "DELETE" });
  }

  return (
    <Card className="border-amber-200">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-amber-700">
          <Lock className="h-4 w-4" />
          Supervisor team workspace
        </CardTitle>
        <p className="text-[11px] text-amber-700/80 mt-1">
          Supervisors only — hidden from students, external advisors, and
          committee members.
        </p>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex items-center gap-2">
          <FolderOpen className="h-4 w-4 text-[var(--c-blue)] shrink-0" />
          {editingFolder ? (
            <>
              <Input
                value={folderDraft}
                onChange={(e) => setFolderDraft(e.target.value)}
                placeholder="https://drive.google.com/drive/folders/…"
                className="!h-8 flex-1"
              />
              <Button type="button" size="sm" variant="brand" onClick={saveFolder}>
                Save
              </Button>
            </>
          ) : folder ? (
            <a
              href={folder}
              target="_blank"
              rel="noopener"
              className="flex-1 truncate text-sm text-[var(--c-blue)] hover:underline"
            >
              Shared team Drive folder
            </a>
          ) : (
            <span className="flex-1 text-sm text-slate-400 italic">
              No shared team folder set
            </span>
          )}
          {isAdmin && !editingFolder && (
            <button
              type="button"
              onClick={() => setEditingFolder(true)}
              className="text-slate-400 hover:text-slate-700"
              title="Set shared folder (admin)"
            >
              <Pencil className="h-3.5 w-3.5" />
            </button>
          )}
        </div>

        <div className="border-t pt-3 space-y-2">
          <div className="flex gap-2">
            <textarea
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              placeholder="Internal note for the supervisory team…"
              rows={2}
              className="flex-1 rounded-lg border bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-300/40 resize-y"
            />
            <Button
              type="button"
              size="sm"
              variant="brand"
              onClick={add}
              disabled={busy || !draft.trim()}
              className="self-end"
            >
              <Send className="h-3.5 w-3.5" /> Post
            </Button>
          </div>
          {notes.length === 0 ? (
            <p className="text-sm text-slate-400">No team notes yet.</p>
          ) : (
            <ul className="space-y-2">
              {notes.map((n) => (
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
                    {(n.author.id === viewerId || isAdmin) && (
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
              ))}
            </ul>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
