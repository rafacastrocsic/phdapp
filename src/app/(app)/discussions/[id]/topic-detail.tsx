"use client";
import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ArrowLeft,
  Pin,
  PinOff,
  Lock,
  Users,
  Pencil,
  Trash2,
  GraduationCap,
  Lock as LockIcon,
  Unlock,
  FolderOpen,
  ExternalLink as ExternalLinkIcon,
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
import { LinksSection } from "@/components/links-section";
import { DriveFolderPicker } from "@/components/drive-folder-picker";
import { CommentsThread } from "@/components/comments-thread";
import { linkify } from "@/lib/linkify";
import { relativeTime } from "@/lib/utils";
import type { ExternalLink } from "@/lib/links";

const DRIVE_FOLDER_URL_RE = /\/folders\/([a-zA-Z0-9_-]+)/;

type Topic = {
  id: string;
  title: string;
  body: string | null;
  visibility: "team" | "supervisors";
  pinned: boolean;
  closed: boolean;
  author: { id: string; name: string | null; image: string | null; color: string };
  student: { id: string; name: string; color: string } | null;
  links: ExternalLink[];
  driveFolderUrl: string | null;
  createdAt: string;
};

export function TopicDetail({
  topic,
  canEdit,
  driveRoots,
  students,
}: {
  topic: Topic;
  canEdit: boolean;
  driveRoots: { id: string; name: string; kind: "student" | "team" }[];
  students: { id: string; name: string; color: string }[];
  viewerId: string;
}) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [driveUrl, setDriveUrl] = useState<string | null>(topic.driveFolderUrl);

  async function patch(payload: Record<string, unknown>) {
    setBusy(true);
    await fetch(`/api/discussions/${topic.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    setBusy(false);
    router.refresh();
  }

  async function remove() {
    if (!window.confirm("Delete this discussion and all its comments?")) return;
    setBusy(true);
    const r = await fetch(`/api/discussions/${topic.id}`, { method: "DELETE" });
    if (r.ok) router.push("/discussions");
    else setBusy(false);
  }

  const driveId = driveUrl
    ? driveUrl.match(DRIVE_FOLDER_URL_RE)?.[1] ?? null
    : null;

  return (
    <div className="mx-auto w-full max-w-3xl p-4 md:p-6">
      <Link
        href="/discussions"
        className="mb-4 inline-flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-800"
      >
        <ArrowLeft className="h-4 w-4" /> All discussions
      </Link>

      {/* ── Header ── */}
      <div className="rounded-xl border bg-white p-5">
        <div className="flex items-start justify-between gap-3">
          <h1 className="text-lg font-bold text-slate-900 [overflow-wrap:anywhere]">
            {topic.title}
          </h1>
          {canEdit && (
            <div className="flex shrink-0 items-center gap-1">
              <IconBtn
                title="Edit"
                onClick={() => setEditing(true)}
                disabled={busy}
              >
                <Pencil className="h-4 w-4" />
              </IconBtn>
              <IconBtn
                title={topic.pinned ? "Unpin" : "Pin to top"}
                onClick={() => patch({ pinned: !topic.pinned })}
                disabled={busy}
              >
                {topic.pinned ? (
                  <PinOff className="h-4 w-4" />
                ) : (
                  <Pin className="h-4 w-4" />
                )}
              </IconBtn>
              <IconBtn
                title={topic.closed ? "Re-open" : "Close thread"}
                onClick={() => patch({ closed: !topic.closed })}
                disabled={busy}
              >
                {topic.closed ? (
                  <Unlock className="h-4 w-4" />
                ) : (
                  <LockIcon className="h-4 w-4" />
                )}
              </IconBtn>
              <IconBtn title="Delete" danger onClick={remove} disabled={busy}>
                <Trash2 className="h-4 w-4" />
              </IconBtn>
            </div>
          )}
        </div>

        <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1.5 text-xs text-slate-500">
          <span className="inline-flex items-center gap-1.5">
            <Avatar
              name={topic.author.name}
              src={topic.author.image}
              color={topic.author.color}
              size="xs"
            />
            {topic.author.name ?? "Someone"} · {relativeTime(topic.createdAt)}
          </span>
          {topic.visibility === "team" ? (
            <span className="inline-flex items-center gap-1 text-emerald-600">
              <Users className="h-3.5 w-3.5" /> Whole team
            </span>
          ) : (
            <span className="inline-flex items-center gap-1 text-amber-600">
              <Lock className="h-3.5 w-3.5" /> Supervisors only
            </span>
          )}
          {topic.student && (
            <span className="inline-flex items-center gap-1">
              <GraduationCap className="h-3.5 w-3.5" />
              <span
                className="inline-block h-2 w-2 rounded-full"
                style={{ background: topic.student.color }}
              />
              {topic.student.name}
            </span>
          )}
          {topic.closed && (
            <span className="rounded-full bg-slate-200 px-2 py-0.5 text-[10px] font-semibold uppercase text-slate-500">
              Closed
            </span>
          )}
        </div>

        {topic.body && (
          <div className="mt-4 whitespace-pre-wrap text-sm text-slate-800 [overflow-wrap:anywhere]">
            {linkify(topic.body)}
          </div>
        )}
      </div>

      {/* ── Links + Documents ── */}
      <div className="mt-4 space-y-4 rounded-xl border bg-white p-5">
        {canEdit ? (
          <LinksSection
            initialLinks={topic.links}
            save={async (next) => {
              await fetch(`/api/discussions/${topic.id}`, {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ links: next }),
              });
              router.refresh();
            }}
            emptyHint="No links yet — add a paper, Overleaf doc, repo…"
          />
        ) : topic.links.length > 0 ? (
          <div>
            <div className="mb-2 text-xs font-semibold uppercase text-slate-500">
              Links ({topic.links.length})
            </div>
            <ul className="space-y-1.5">
              {topic.links.map((l) => (
                <li key={l.id}>
                  <a
                    href={l.url}
                    target="_blank"
                    rel="noopener"
                    className="inline-flex items-center gap-1.5 rounded-md border bg-slate-50 px-2.5 py-1.5 text-sm font-medium text-slate-800 hover:text-[var(--c-violet)]"
                  >
                    <ExternalLinkIcon className="h-3.5 w-3.5 text-slate-400" />
                    {l.label}
                  </a>
                </li>
              ))}
            </ul>
          </div>
        ) : null}

        <div>
          <div className="mb-2 flex items-center gap-1.5 text-xs font-semibold uppercase text-slate-500">
            <FolderOpen className="h-3 w-3" /> Documents
          </div>
          {canEdit ? (
            <DriveFolderPicker
              value={driveId}
              onChange={(folderId) => {
                const url = folderId
                  ? `https://drive.google.com/drive/folders/${folderId}`
                  : null;
                setDriveUrl(url);
                void patch({ driveFolderUrl: url });
              }}
              triggerLabel={driveUrl ? "Change folder" : "Pick from Drive"}
              roots={driveRoots}
            />
          ) : driveUrl ? (
            <a
              href={driveUrl}
              target="_blank"
              rel="noopener"
              className="inline-flex items-center gap-2 rounded-lg border bg-slate-50 px-3 py-1.5 text-sm font-medium text-slate-700 hover:text-[var(--c-blue)]"
            >
              <FolderOpen className="h-4 w-4 text-[var(--c-blue)]" /> Open Drive
              folder
            </a>
          ) : (
            <p className="text-xs italic text-slate-400">No documents linked.</p>
          )}
        </div>
      </div>

      {/* ── Discussion ── */}
      <div className="mt-4 rounded-xl border bg-white p-5">
        {topic.closed && (
          <div className="mb-3 rounded-lg bg-slate-50 px-3 py-2 text-xs text-slate-500">
            This discussion is closed — no new comments can be added.
          </div>
        )}
        <CommentsThread
          apiBase={`/api/discussions/${topic.id}/comments`}
          readOnly={topic.closed}
          emptyHint="No comments yet — kick off the discussion."
          composerPlaceholder="Share a thought, a link, a question…"
        />
      </div>

      {editing && (
        <EditTopicDialog
          topic={topic}
          students={students}
          onClose={() => setEditing(false)}
          onSaved={(payload) => {
            setEditing(false);
            void patch(payload);
          }}
        />
      )}
    </div>
  );
}

function IconBtn({
  children,
  title,
  onClick,
  disabled,
  danger,
}: {
  children: React.ReactNode;
  title: string;
  onClick: () => void;
  disabled?: boolean;
  danger?: boolean;
}) {
  return (
    <button
      type="button"
      title={title}
      onClick={onClick}
      disabled={disabled}
      className={
        "inline-flex h-8 w-8 items-center justify-center rounded-lg text-slate-400 transition-colors hover:bg-slate-100 disabled:opacity-40 " +
        (danger ? "hover:text-[var(--c-red)]" : "hover:text-slate-700")
      }
    >
      {children}
    </button>
  );
}

function EditTopicDialog({
  topic,
  students,
  onClose,
  onSaved,
}: {
  topic: Topic;
  students: { id: string; name: string; color: string }[];
  onClose: () => void;
  onSaved: (payload: Record<string, unknown>) => void;
}) {
  const [title, setTitle] = useState(topic.title);
  const [body, setBody] = useState(topic.body ?? "");
  const [visibility, setVisibility] = useState<"supervisors" | "team">(
    topic.visibility,
  );
  const [studentId, setStudentId] = useState(topic.student?.id ?? "");

  function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!title.trim()) return;
    onSaved({
      title: title.trim(),
      body: body.trim() || null,
      visibility,
      studentId: studentId || null,
    });
  }

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Edit discussion</DialogTitle>
        </DialogHeader>
        <form onSubmit={submit} className="space-y-3">
          <div>
            <label className="mb-1 block text-xs font-semibold text-slate-600">
              Title
            </label>
            <Input value={title} onChange={(e) => setTitle(e.target.value)} />
          </div>
          <div>
            <label className="mb-1 block text-xs font-semibold text-slate-600">
              Opening post
            </label>
            <Textarea
              rows={4}
              value={body}
              onChange={(e) => setBody(e.target.value)}
            />
          </div>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div>
              <label className="mb-1 block text-xs font-semibold text-slate-600">
                Who can read it
              </label>
              <Select
                value={visibility}
                onChange={(e) =>
                  setVisibility(e.target.value as "supervisors" | "team")
                }
              >
                <option value="supervisors">Supervisors only</option>
                <option value="team">Whole team (incl. students)</option>
              </Select>
            </div>
            <div>
              <label className="mb-1 block text-xs font-semibold text-slate-600">
                Tag a student
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
          <div className="flex justify-end gap-2 border-t pt-3">
            <Button type="button" variant="ghost" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" variant="brand" disabled={!title.trim()}>
              Save changes
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
