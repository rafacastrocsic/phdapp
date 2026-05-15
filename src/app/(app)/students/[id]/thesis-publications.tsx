"use client";
import { useState } from "react";
import { ExternalLink, Plus, X } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input, Select } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";

interface Chapter {
  id: string;
  title: string;
  status: string;
  driveUrl: string | null;
  notes: string | null;
}
interface Publication {
  id: string;
  title: string;
  venue: string | null;
  type: string;
  status: string;
  authors: string | null;
  url: string | null;
  driveUrl: string | null;
  submittedAt: string | null;
  decisionAt: string | null;
  notes: string | null;
}

const CHAPTER_STATUS: { id: string; label: string; color: string }[] = [
  { id: "planned", label: "Planned", color: "#94a3b8" },
  { id: "drafting", label: "Drafting", color: "#2196f3" },
  { id: "in_review", label: "In review", color: "#a855f7" },
  { id: "revising", label: "Revising", color: "#ff7a45" },
  { id: "done", label: "Done", color: "#00ca72" },
];
const PUB_TYPE = [
  { id: "journal", label: "Journal" },
  { id: "conference", label: "Conference" },
  { id: "preprint", label: "Preprint" },
  { id: "other", label: "Other" },
];
const PUB_STATUS: { id: string; label: string; color: string }[] = [
  { id: "in_prep", label: "In prep", color: "#94a3b8" },
  { id: "submitted", label: "Submitted", color: "#2196f3" },
  { id: "under_review", label: "Under review", color: "#a855f7" },
  { id: "major_rev", label: "Major revision", color: "#ff7a45" },
  { id: "minor_rev", label: "Minor revision", color: "#f59e0b" },
  { id: "accepted", label: "Accepted", color: "#00ca72" },
  { id: "published", label: "Published", color: "#0ea5e9" },
  { id: "rejected", label: "Rejected", color: "#e2445c" },
];

function color(list: { id: string; color: string }[], id: string) {
  return list.find((s) => s.id === id)?.color ?? "#94a3b8";
}

export function ThesisPublications({
  studentId,
  canWrite,
  initialChapters,
  initialPublications,
}: {
  studentId: string;
  canWrite: boolean;
  initialChapters: Chapter[];
  initialPublications: Publication[];
}) {
  const [chapters, setChapters] = useState<Chapter[]>(initialChapters);
  const [pubs, setPubs] = useState<Publication[]>(initialPublications);
  const [newChapter, setNewChapter] = useState("");
  const [newPub, setNewPub] = useState("");
  const [busy, setBusy] = useState(false);

  async function addChapter() {
    const title = newChapter.trim();
    if (!title) return;
    setBusy(true);
    const r = await fetch(`/api/students/${studentId}/thesis`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title }),
    });
    setBusy(false);
    if (r.ok) {
      const { chapter } = await r.json();
      setChapters((p) => [...p, chapter]);
      setNewChapter("");
    }
  }
  async function patchChapter(id: string, patch: Partial<Chapter>) {
    setChapters((p) => p.map((c) => (c.id === id ? { ...c, ...patch } : c)));
    await fetch(`/api/students/${studentId}/thesis/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(patch),
    });
  }
  async function delChapter(id: string) {
    if (!confirm("Delete this chapter?")) return;
    setChapters((p) => p.filter((c) => c.id !== id));
    await fetch(`/api/students/${studentId}/thesis/${id}`, { method: "DELETE" });
  }

  async function addPub() {
    const title = newPub.trim();
    if (!title) return;
    setBusy(true);
    const r = await fetch(`/api/students/${studentId}/publications`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title }),
    });
    setBusy(false);
    if (r.ok) {
      const { publication } = await r.json();
      setPubs((p) => [publication, ...p]);
      setNewPub("");
    }
  }
  async function patchPub(id: string, patch: Partial<Publication>) {
    setPubs((p) => p.map((x) => (x.id === id ? { ...x, ...patch } : x)));
    await fetch(`/api/students/${studentId}/publications/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(patch),
    });
  }
  async function delPub(id: string) {
    if (!confirm("Delete this publication?")) return;
    setPubs((p) => p.filter((x) => x.id !== id));
    await fetch(`/api/students/${studentId}/publications/${id}`, { method: "DELETE" });
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Thesis &amp; publications</CardTitle>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Thesis chapters */}
        <div className="space-y-2">
          <h4 className="text-xs font-semibold uppercase tracking-wide text-slate-500">
            Thesis chapters
          </h4>
          {chapters.length === 0 && (
            <p className="text-sm text-slate-400">No chapters yet.</p>
          )}
          <ul className="space-y-1.5">
            {chapters.map((c) => (
              <li
                key={c.id}
                className="rounded-lg border bg-white p-2 space-y-1"
              >
                <div className="flex items-center gap-2">
                {canWrite ? (
                  <input
                    defaultValue={c.title}
                    onBlur={(e) =>
                      e.target.value.trim() &&
                      e.target.value !== c.title &&
                      patchChapter(c.id, { title: e.target.value.trim() })
                    }
                    className="flex-1 min-w-0 bg-transparent text-sm focus:outline-none focus:bg-slate-50 rounded px-1"
                  />
                ) : (
                  <span className="flex-1 min-w-0 truncate text-sm">{c.title}</span>
                )}
                {c.driveUrl && (
                  <a
                    href={c.driveUrl}
                    target="_blank"
                    rel="noopener"
                    className="text-slate-400 hover:text-[var(--c-blue)]"
                    title="Open document"
                  >
                    <ExternalLink className="h-3.5 w-3.5" />
                  </a>
                )}
                {canWrite ? (
                  <Select
                    value={c.status}
                    onChange={(e) => patchChapter(c.id, { status: e.target.value })}
                    className="!h-7 !w-auto !text-xs"
                  >
                    {CHAPTER_STATUS.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.label}
                      </option>
                    ))}
                  </Select>
                ) : (
                  <Badge color={color(CHAPTER_STATUS, c.status)}>
                    {CHAPTER_STATUS.find((s) => s.id === c.status)?.label ?? c.status}
                  </Badge>
                )}
                {canWrite && (
                  <button
                    type="button"
                    onClick={() => delChapter(c.id)}
                    className="text-slate-300 hover:text-[var(--c-red)]"
                    title="Delete chapter"
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                )}
                </div>
                {canWrite && (
                  <input
                    defaultValue={c.driveUrl ?? ""}
                    onBlur={(e) =>
                      e.target.value !== (c.driveUrl ?? "") &&
                      patchChapter(c.id, { driveUrl: e.target.value || null })
                    }
                    placeholder="Drive file/folder URL…"
                    className="w-full h-7 rounded border bg-white px-2 text-xs text-slate-600 placeholder:text-slate-400 focus:outline-none"
                  />
                )}
              </li>
            ))}
          </ul>
          {canWrite && (
            <div className="flex gap-2">
              <Input
                value={newChapter}
                onChange={(e) => setNewChapter(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), addChapter())}
                placeholder="Add a chapter…"
                className="!h-8 !text-sm"
              />
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={addChapter}
                disabled={busy || !newChapter.trim()}
              >
                <Plus className="h-3.5 w-3.5" /> Add
              </Button>
            </div>
          )}
        </div>

        {/* Publications */}
        <div className="space-y-2 border-t pt-4">
          <h4 className="text-xs font-semibold uppercase tracking-wide text-slate-500">
            Publications
          </h4>
          {pubs.length === 0 && (
            <p className="text-sm text-slate-400">No publications yet.</p>
          )}
          <ul className="space-y-1.5">
            {pubs.map((p) => (
              <li key={p.id} className="rounded-lg border bg-white p-2 space-y-1">
                <div className="flex items-center gap-2">
                  {canWrite ? (
                    <input
                      defaultValue={p.title}
                      onBlur={(e) =>
                        e.target.value.trim() &&
                        e.target.value !== p.title &&
                        patchPub(p.id, { title: e.target.value.trim() })
                      }
                      className="flex-1 min-w-0 bg-transparent text-sm font-medium focus:outline-none focus:bg-slate-50 rounded px-1"
                    />
                  ) : (
                    <span className="flex-1 min-w-0 truncate text-sm font-medium">
                      {p.title}
                    </span>
                  )}
                  {p.url && (
                    <a
                      href={p.url}
                      target="_blank"
                      rel="noopener"
                      className="text-slate-400 hover:text-[var(--c-blue)]"
                      title="Open"
                    >
                      <ExternalLink className="h-3.5 w-3.5" />
                    </a>
                  )}
                  {p.driveUrl && (
                    <a
                      href={p.driveUrl}
                      target="_blank"
                      rel="noopener"
                      className="text-slate-400 hover:text-[var(--c-blue)]"
                      title="Open in Drive"
                    >
                      <ExternalLink className="h-3.5 w-3.5" />
                    </a>
                  )}
                  {canWrite && (
                    <button
                      type="button"
                      onClick={() => delPub(p.id)}
                      className="text-slate-300 hover:text-[var(--c-red)]"
                      title="Delete publication"
                    >
                      <X className="h-3.5 w-3.5" />
                    </button>
                  )}
                </div>
                <div className="flex flex-wrap items-center gap-2 pl-1">
                  {canWrite ? (
                    <>
                      <Select
                        value={p.type}
                        onChange={(e) => patchPub(p.id, { type: e.target.value })}
                        className="!h-7 !w-auto !text-xs"
                      >
                        {PUB_TYPE.map((t) => (
                          <option key={t.id} value={t.id}>
                            {t.label}
                          </option>
                        ))}
                      </Select>
                      <Select
                        value={p.status}
                        onChange={(e) => patchPub(p.id, { status: e.target.value })}
                        className="!h-7 !w-auto !text-xs"
                      >
                        {PUB_STATUS.map((s) => (
                          <option key={s.id} value={s.id}>
                            {s.label}
                          </option>
                        ))}
                      </Select>
                      <input
                        defaultValue={p.venue ?? ""}
                        onBlur={(e) =>
                          e.target.value !== (p.venue ?? "") &&
                          patchPub(p.id, { venue: e.target.value || null })
                        }
                        placeholder="venue"
                        className="h-7 flex-1 min-w-[8rem] rounded border bg-white px-2 text-xs focus:outline-none"
                      />
                      <input
                        defaultValue={p.driveUrl ?? ""}
                        onBlur={(e) =>
                          e.target.value !== (p.driveUrl ?? "") &&
                          patchPub(p.id, { driveUrl: e.target.value || null })
                        }
                        placeholder="Drive URL"
                        className="h-7 flex-1 min-w-[8rem] rounded border bg-white px-2 text-xs focus:outline-none"
                      />
                    </>
                  ) : (
                    <>
                      <Badge color={color(PUB_STATUS, p.status)}>
                        {PUB_STATUS.find((s) => s.id === p.status)?.label ?? p.status}
                      </Badge>
                      <span className="text-xs text-slate-500">
                        {PUB_TYPE.find((t) => t.id === p.type)?.label ?? p.type}
                        {p.venue ? ` · ${p.venue}` : ""}
                      </span>
                    </>
                  )}
                </div>
              </li>
            ))}
          </ul>
          {canWrite && (
            <div className="flex gap-2">
              <Input
                value={newPub}
                onChange={(e) => setNewPub(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), addPub())}
                placeholder="Add a publication…"
                className="!h-8 !text-sm"
              />
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={addPub}
                disabled={busy || !newPub.trim()}
              >
                <Plus className="h-3.5 w-3.5" /> Add
              </Button>
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
