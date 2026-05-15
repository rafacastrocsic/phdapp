"use client";
import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { BookOpen, ExternalLink, Check, X, Plus } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input, Select } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";

interface Person {
  id: string;
  name: string | null;
  image: string | null;
  color: string;
}
interface StudentLite {
  id: string;
  fullName: string;
  alias: string | null;
  color: string;
}
interface ReadingItem {
  id: string;
  studentId: string;
  student: StudentLite;
  title: string;
  authors: string | null;
  url: string | null;
  status: string;
  proposedByStudent: boolean;
  decisionNote: string | null;
  addedBy: Person;
  createdAt: string;
}

const STATUS: Record<string, { label: string; color: string }> = {
  proposed: { label: "Pending approval", color: "#f59e0b" },
  approved: { label: "To read", color: "#2196f3" },
  reading: { label: "Reading", color: "#6f4cff" },
  done: { label: "Read", color: "#00ca72" },
  rejected: { label: "Rejected", color: "#94a3b8" },
};

function studentName(s: StudentLite) {
  return s.alias?.trim() || s.fullName;
}

export function ReadingView({
  viewerRole,
  students,
  levelByStudent,
  initialStudent,
  initialItems,
}: {
  viewerRole: string;
  students: StudentLite[];
  levelByStudent: Record<string, string>;
  initialStudent: string | null;
  initialItems: ReadingItem[];
}) {
  const router = useRouter();
  const [items, setItems] = useState<ReadingItem[]>(initialItems);
  const [studentFilter, setStudentFilter] = useState(initialStudent ?? "");
  const [title, setTitle] = useState("");
  const [authors, setAuthors] = useState("");
  const [url, setUrl] = useState("");
  // Students the viewer can ADD/PROPOSE for (supervisor of, or themselves).
  const addable = students.filter(
    (s) => levelByStudent[s.id] === "supervisor" || levelByStudent[s.id] === "self",
  );
  const [addTarget, setAddTarget] = useState(
    initialStudent && addable.some((s) => s.id === initialStudent)
      ? initialStudent
      : addable[0]?.id ?? "",
  );
  const [busy, setBusy] = useState(false);

  const visible = useMemo(
    () => (studentFilter ? items.filter((i) => i.studentId === studentFilter) : items),
    [items, studentFilter],
  );
  const pending = visible.filter((i) => i.status === "proposed");
  const rest = visible.filter((i) => i.status !== "proposed");

  function canDecide(i: ReadingItem) {
    return levelByStudent[i.studentId] === "supervisor";
  }
  function canProgress(i: ReadingItem) {
    const lvl = levelByStudent[i.studentId];
    return lvl === "supervisor" || lvl === "self";
  }

  async function add() {
    const t = title.trim();
    if (!t || !addTarget) return;
    setBusy(true);
    const r = await fetch(`/api/students/${addTarget}/reading`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        title: t,
        authors: authors.trim() || null,
        url: url.trim() || null,
      }),
    });
    setBusy(false);
    if (r.ok) {
      const { item } = await r.json();
      const s = students.find((x) => x.id === addTarget)!;
      setItems((p) => [{ ...item, student: s }, ...p]);
      setTitle("");
      setAuthors("");
      setUrl("");
    }
  }

  async function patch(i: ReadingItem, body: Record<string, unknown>) {
    setItems((p) =>
      p.map((x) => (x.id === i.id ? { ...x, ...body } : x)),
    );
    await fetch(`/api/students/${i.studentId}/reading/${i.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    router.refresh();
  }
  async function del(i: ReadingItem) {
    if (!confirm("Delete this reading?")) return;
    setItems((p) => p.filter((x) => x.id !== i.id));
    await fetch(`/api/students/${i.studentId}/reading/${i.id}`, {
      method: "DELETE",
    });
  }

  function Row({ i }: { i: ReadingItem }) {
    const st = STATUS[i.status] ?? STATUS.approved!;
    return (
      <li className="flex items-start gap-3 rounded-lg border bg-white p-3">
        <span
          className="mt-0.5 flex h-8 w-8 items-center justify-center rounded-lg shrink-0"
          style={{ background: `${st.color}1f`, color: st.color }}
        >
          <BookOpen className="h-4 w-4" />
        </span>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            {i.url ? (
              <a
                href={i.url}
                target="_blank"
                rel="noopener"
                className="text-sm font-medium text-slate-900 hover:text-[var(--c-blue)] truncate inline-flex items-center gap-1"
              >
                {i.title}
                <ExternalLink className="h-3 w-3 shrink-0" />
              </a>
            ) : (
              <span className="text-sm font-medium text-slate-900 truncate">
                {i.title}
              </span>
            )}
            <Badge color={st.color}>{st.label}</Badge>
            {!studentFilter && (
              <span className="text-[10px] text-slate-500">
                · {studentName(i.student)}
              </span>
            )}
          </div>
          {i.authors && (
            <div className="text-xs text-slate-500 mt-0.5 truncate">{i.authors}</div>
          )}
          <div className="text-[10px] text-slate-400 mt-0.5">
            {i.proposedByStudent ? "Proposed by student" : "Added"} by{" "}
            {i.addedBy.name ?? "someone"}
            {i.decisionNote ? ` · note: ${i.decisionNote}` : ""}
          </div>
        </div>
        <div className="flex flex-col gap-1 items-end shrink-0">
          {i.status === "proposed" && canDecide(i) && (
            <div className="flex gap-1">
              <Button
                type="button"
                size="sm"
                variant="brand"
                onClick={() => patch(i, { status: "approved" })}
              >
                <Check className="h-3.5 w-3.5" /> Approve
              </Button>
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={() => patch(i, { status: "rejected" })}
              >
                Reject
              </Button>
            </div>
          )}
          {i.status === "approved" && canProgress(i) && (
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={() => patch(i, { status: "reading" })}
            >
              Start reading
            </Button>
          )}
          {i.status === "reading" && canProgress(i) && (
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={() => patch(i, { status: "done" })}
            >
              Mark read
            </Button>
          )}
          {canProgress(i) && (
            <button
              type="button"
              onClick={() => del(i)}
              className="text-slate-300 hover:text-[var(--c-red)]"
              title="Delete"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          )}
        </div>
      </li>
    );
  }

  const isStudentViewer = viewerRole === "student";

  return (
    <div className="p-6 lg:p-8 space-y-6">
      <div className="flex items-end justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Reading</h1>
          <p className="text-sm text-slate-500 mt-1">
            {isStudentViewer
              ? "Papers to read — proposed by your supervisors, or suggested by you for approval."
              : "Reading lists across your students. Approve what they propose; add what they should read."}
          </p>
        </div>
        {students.length > 1 && (
          <Select
            value={studentFilter}
            onChange={(e) => setStudentFilter(e.target.value)}
            className="!w-auto"
          >
            <option value="">All students</option>
            {students.map((s) => (
              <option key={s.id} value={s.id}>
                {studentName(s)}
              </option>
            ))}
          </Select>
        )}
      </div>

      {addable.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">
              {isStudentViewer ? "Propose a reading" : "Add a reading"}
            </CardTitle>
            {isStudentViewer && (
              <p className="text-[11px] text-slate-500 mt-1">
                Proposals wait for a supervisor&apos;s OK before they appear as
                &ldquo;to read&rdquo;.
              </p>
            )}
          </CardHeader>
          <CardContent className="space-y-2">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              <Input
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="Title *"
              />
              <Input
                value={authors}
                onChange={(e) => setAuthors(e.target.value)}
                placeholder="Authors (optional)"
              />
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-[1fr_auto_auto] gap-2">
              <Input
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                placeholder="Link / DOI (optional)"
              />
              {addable.length > 1 && (
                <Select
                  value={addTarget}
                  onChange={(e) => setAddTarget(e.target.value)}
                  className="!w-auto"
                >
                  {addable.map((s) => (
                    <option key={s.id} value={s.id}>
                      {studentName(s)}
                    </option>
                  ))}
                </Select>
              )}
              <Button
                type="button"
                variant="brand"
                onClick={add}
                disabled={busy || !title.trim() || !addTarget}
              >
                <Plus className="h-4 w-4" />{" "}
                {isStudentViewer ? "Propose" : "Add"}
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {pending.length > 0 && (
        <Card className="border-amber-200">
          <CardHeader>
            <CardTitle className="text-base text-amber-700">
              Pending approval ({pending.length})
            </CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="space-y-2">
              {pending.map((i) => (
                <Row key={i.id} i={i} />
              ))}
            </ul>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Reading list</CardTitle>
        </CardHeader>
        <CardContent>
          {rest.length === 0 ? (
            <p className="text-sm text-slate-400">Nothing here yet.</p>
          ) : (
            <ul className="space-y-2">
              {rest.map((i) => (
                <Row key={i.id} i={i} />
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
