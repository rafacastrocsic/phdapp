"use client";
import { useEffect, useState, useCallback } from "react";
import { Megaphone, Trash2, Plus, Pencil } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input, Textarea } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

type Post = { id: string; title: string; body: string; publishedAt: string };

export function NewsManager() {
  const [posts, setPosts] = useState<Post[]>([]);
  const [enabled, setEnabled] = useState(true);
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    const r = await fetch("/api/admin/news", { cache: "no-store" });
    if (!r.ok) return;
    const j = await r.json();
    setPosts(j.posts ?? []);
    setEnabled(!!j.enabled);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function toggle(next: boolean) {
    setEnabled(next);
    await fetch("/api/admin/news", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ kind: "toggle", enabled: next }),
    });
  }

  async function save() {
    if (!title.trim() || !body.trim()) return;
    setBusy(true);
    const r = await fetch(
      editingId ? `/api/admin/news/${editingId}` : "/api/admin/news",
      {
        method: editingId ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(
          editingId
            ? { title: title.trim(), body: body.trim() }
            : { kind: "post", title: title.trim(), body: body.trim() },
        ),
      },
    );
    setBusy(false);
    if (r.ok) {
      setTitle("");
      setBody("");
      setEditingId(null);
      void load();
    }
  }

  async function del(id: string) {
    if (!confirm("Delete this announcement?")) return;
    await fetch(`/api/admin/news/${id}`, { method: "DELETE" });
    if (editingId === id) {
      setEditingId(null);
      setTitle("");
      setBody("");
    }
    void load();
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Megaphone className="h-4 w-4 text-[var(--c-violet)]" /> News &amp; announcements
        </CardTitle>
        <p className="mt-1 text-xs text-slate-500">
          Post &ldquo;What&apos;s new in PhDApp&rdquo; updates everyone sees in the News
          window, alongside their own recent activity.
        </p>
      </CardHeader>
      <CardContent className="space-y-4">
        <label className="flex items-center gap-2 text-sm text-slate-700">
          <input
            type="checkbox"
            checked={enabled}
            onChange={(e) => void toggle(e.target.checked)}
            className="h-4 w-4 rounded"
          />
          News window enabled for everyone
        </label>

        <div className="space-y-2 rounded-xl border p-3">
          <div className="text-xs font-semibold uppercase text-slate-500">
            {editingId ? "Edit announcement" : "New announcement"}
          </div>
          <Input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Title (e.g. “New: link a discussion to a task”)"
          />
          <Textarea
            rows={3}
            value={body}
            onChange={(e) => setBody(e.target.value)}
            placeholder="What changed and why it's useful…"
          />
          <div className="flex justify-end gap-2">
            {editingId && (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  setEditingId(null);
                  setTitle("");
                  setBody("");
                }}
              >
                Cancel
              </Button>
            )}
            <Button
              variant="brand"
              size="sm"
              onClick={save}
              disabled={busy || !title.trim() || !body.trim()}
            >
              <Plus className="h-4 w-4" /> {editingId ? "Save" : "Post"}
            </Button>
          </div>
        </div>

        {posts.length > 0 && (
          <ul className="space-y-2">
            {posts.map((p) => (
              <li
                key={p.id}
                className="flex items-start justify-between gap-2 rounded-lg border p-3"
              >
                <div className="min-w-0">
                  <div className="font-medium text-slate-900">{p.title}</div>
                  <p className="mt-0.5 line-clamp-2 text-sm text-slate-500">{p.body}</p>
                  <div className="mt-1 text-[11px] text-slate-400">
                    {new Date(p.publishedAt).toLocaleDateString()}
                  </div>
                </div>
                <div className="flex shrink-0 gap-1">
                  <button
                    type="button"
                    title="Edit"
                    onClick={() => {
                      setEditingId(p.id);
                      setTitle(p.title);
                      setBody(p.body);
                    }}
                    className="rounded-md p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
                  >
                    <Pencil className="h-4 w-4" />
                  </button>
                  <button
                    type="button"
                    title="Delete"
                    onClick={() => void del(p.id)}
                    className="rounded-md p-1.5 text-slate-400 hover:bg-red-50 hover:text-[var(--c-red)]"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
