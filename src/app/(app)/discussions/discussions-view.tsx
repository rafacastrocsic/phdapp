"use client";
import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  Plus,
  Lightbulb,
  Pin,
  Lock,
  Users,
  MessageSquare,
  Link2,
  FolderOpen,
  GraduationCap,
} from "lucide-react";
import { Avatar } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Input, Textarea, Select } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { cn, relativeTime } from "@/lib/utils";

type TopicRow = {
  id: string;
  title: string;
  excerpt: string | null;
  author: { name: string | null; image: string | null; color: string };
  visibility: "team" | "supervisors";
  student: { id: string; name: string; color: string } | null;
  pinned: boolean;
  closed: boolean;
  commentCount: number;
  linkCount: number;
  hasDrive: boolean;
  lastActivityAt: string;
  createdAt: string;
};

type StudentOpt = { id: string; name: string; color: string };

export function DiscussionsView({
  topics,
  students,
  canCreate,
  senior,
}: {
  topics: TopicRow[];
  students: StudentOpt[];
  canCreate: boolean;
  /** Only the senior team may create "Supervisors only" topics. */
  senior: boolean;
  viewerId: string;
}) {
  const [creating, setCreating] = useState(false);

  return (
    <div className="mx-auto w-full max-w-4xl p-4 md:p-6">
      <div className="mb-5 flex items-start justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-xl font-bold text-slate-900">
            <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-violet-50 text-[var(--c-violet)]">
              <Lightbulb className="h-4 w-4" />
            </span>
            Discussions
          </h1>
          <p className="mt-1 text-sm text-slate-500">
            Topic threads for the team — brainstorms, open questions, decisions.
            Persistent, with links and documents that don&apos;t expire.
          </p>
        </div>
        {canCreate && (
          <Button variant="brand" onClick={() => setCreating(true)}>
            <Plus className="h-4 w-4" /> New topic
          </Button>
        )}
      </div>

      {topics.length === 0 ? (
        <div className="rounded-xl border border-dashed bg-slate-50 p-10 text-center">
          <Lightbulb className="mx-auto h-8 w-8 text-slate-300" />
          <p className="mt-3 text-sm font-medium text-slate-600">
            No discussions yet.
          </p>
          <p className="mt-1 text-xs text-slate-400">
            {canCreate
              ? "Start a topic to brainstorm or gather input from the team."
              : "Topics the team shares with you will show up here."}
          </p>
          {canCreate && (
            <Button
              variant="outline"
              size="sm"
              className="mt-4"
              onClick={() => setCreating(true)}
            >
              <Plus className="h-4 w-4" /> New topic
            </Button>
          )}
        </div>
      ) : (
        <ul className="space-y-2.5">
          {topics.map((t) => (
            <li key={t.id}>
              <Link
                href={`/discussions/${t.id}`}
                className={cn(
                  "group block rounded-xl border bg-white p-4 transition-shadow hover:shadow-md",
                  t.pinned && "border-violet-200 bg-violet-50/40",
                )}
              >
                <div className="flex items-start gap-3">
                  <Avatar
                    name={t.author.name}
                    src={t.author.image}
                    color={t.author.color}
                    size="sm"
                  />
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                      {t.pinned && (
                        <Pin className="h-3.5 w-3.5 shrink-0 text-[var(--c-violet)]" />
                      )}
                      <span
                        className={cn(
                          "truncate font-semibold text-slate-900 group-hover:text-[var(--c-violet)]",
                          t.closed && "text-slate-500",
                        )}
                      >
                        {t.title}
                      </span>
                      {t.closed && (
                        <span className="rounded-full bg-slate-200 px-1.5 py-0.5 text-[10px] font-semibold uppercase text-slate-500">
                          Closed
                        </span>
                      )}
                    </div>
                    {t.excerpt && (
                      <p className="mt-0.5 line-clamp-2 text-sm text-slate-500 [overflow-wrap:anywhere]">
                        {t.excerpt}
                      </p>
                    )}
                    <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-slate-400">
                      <span>
                        {t.author.name ?? "Someone"} ·{" "}
                        {relativeTime(t.lastActivityAt)}
                      </span>
                      <VisibilityChip visibility={t.visibility} />
                      {t.student && (
                        <span className="inline-flex items-center gap-1">
                          <GraduationCap className="h-3 w-3" />
                          <span
                            className="inline-block h-2 w-2 rounded-full"
                            style={{ background: t.student.color }}
                          />
                          {t.student.name}
                        </span>
                      )}
                      {t.commentCount > 0 && (
                        <span className="inline-flex items-center gap-1">
                          <MessageSquare className="h-3 w-3" />
                          {t.commentCount}
                        </span>
                      )}
                      {t.linkCount > 0 && (
                        <span className="inline-flex items-center gap-1">
                          <Link2 className="h-3 w-3" />
                          {t.linkCount}
                        </span>
                      )}
                      {t.hasDrive && (
                        <span className="inline-flex items-center gap-1">
                          <FolderOpen className="h-3 w-3" />
                          Docs
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}

      {creating && (
        <NewTopicDialog
          students={students}
          senior={senior}
          onClose={() => setCreating(false)}
        />
      )}
    </div>
  );
}

function VisibilityChip({ visibility }: { visibility: "team" | "supervisors" }) {
  return visibility === "team" ? (
    <span className="inline-flex items-center gap-1 text-emerald-600">
      <Users className="h-3 w-3" /> Whole team
    </span>
  ) : (
    <span className="inline-flex items-center gap-1 text-amber-600">
      <Lock className="h-3 w-3" /> Supervisors
    </span>
  );
}

function NewTopicDialog({
  students,
  senior,
  onClose,
}: {
  students: StudentOpt[];
  senior: boolean;
  onClose: () => void;
}) {
  const router = useRouter();
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  // Non-senior members (students, external advisors, committee) can only open
  // whole-team topics; "Supervisors only" is reserved for the senior team.
  const [visibility, setVisibility] = useState<"supervisors" | "team">(
    senior ? "supervisors" : "team",
  );
  const [studentId, setStudentId] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!title.trim()) return;
    setSaving(true);
    setError(null);
    const r = await fetch("/api/discussions", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        title: title.trim(),
        body: body.trim() || null,
        visibility,
        studentId: studentId || null,
      }),
    });
    if (!r.ok) {
      const j = await r.json().catch(() => ({}));
      setError(j.error ?? "Could not create the topic.");
      setSaving(false);
      return;
    }
    const { id } = await r.json();
    router.push(`/discussions/${id}`);
  }

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>New discussion topic</DialogTitle>
        </DialogHeader>
        <form onSubmit={submit} className="space-y-3">
          <div>
            <label className="mb-1 block text-xs font-semibold text-slate-600">
              Title
            </label>
            <Input
              autoFocus
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g. Which conference should we target this autumn?"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-semibold text-slate-600">
              Opening post{" "}
              <span className="font-normal text-slate-400">(optional)</span>
            </label>
            <Textarea
              rows={4}
              value={body}
              onChange={(e) => setBody(e.target.value)}
              placeholder="Set the context, ask the question, drop initial thoughts…"
            />
          </div>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div>
              <label className="mb-1 block text-xs font-semibold text-slate-600">
                Who can read it
              </label>
              {senior ? (
                <Select
                  value={visibility}
                  onChange={(e) =>
                    setVisibility(e.target.value as "supervisors" | "team")
                  }
                >
                  <option value="supervisors">Supervisors only</option>
                  <option value="team">Whole team (incl. students)</option>
                </Select>
              ) : (
                <div className="flex h-9 items-center rounded-lg border bg-slate-50 px-3 text-sm text-slate-500">
                  Whole team
                </div>
              )}
            </div>
            <div>
              <label className="mb-1 block text-xs font-semibold text-slate-600">
                Tag a student{" "}
                <span className="font-normal text-slate-400">(optional)</span>
              </label>
              <Select
                value={studentId}
                onChange={(e) => setStudentId(e.target.value)}
              >
                <option value="">— none —</option>
                {students.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </Select>
            </div>
          </div>
          <p className="text-[11px] text-slate-400">
            You can add links and a Drive folder of documents once the topic is
            created.
          </p>
          {error && <p className="text-xs text-[var(--c-red)]">{error}</p>}
          <div className="flex justify-end gap-2 border-t pt-3">
            <Button type="button" variant="ghost" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" variant="brand" disabled={saving || !title.trim()}>
              {saving ? "Creating…" : "Create topic"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
