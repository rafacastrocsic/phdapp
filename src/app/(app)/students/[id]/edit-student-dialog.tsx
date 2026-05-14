"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Pencil, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input, Select, Textarea } from "@/components/ui/input";
import { DriveFolderPicker } from "@/components/drive-folder-picker";
import { GoogleCalendarPicker } from "@/components/google-calendar-picker";
import { AvatarUploader } from "./avatar-uploader";

interface StudentInput {
  id: string;
  fullName: string;
  alias: string | null;
  email: string;
  programYear: number;
  status: string;
  thesisTitle: string | null;
  researchArea: string | null;
  driveFolderId: string | null;
  calendarId: string | null;
  color: string;
  expectedEndDate: string | null; // ISO
  avatarUrl: string | null;
  linkedinUrl: string | null;
  orcidId: string | null;
  websiteUrl: string | null;
}

export function EditStudentDialog({
  student,
  canDelete = true,
  canPickResources = false,
}: {
  student: StudentInput;
  canDelete?: boolean;
  canPickResources?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [driveFolderId, setDriveFolderId] = useState<string | null>(
    student.driveFolderId,
  );
  const [calendarId, setCalendarId] = useState<string | null>(student.calendarId);
  const [avatarUrl, setAvatarUrl] = useState<string | null>(student.avatarUrl);
  const router = useRouter();

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    const fd = new FormData(e.currentTarget);
    const payload = {
      ...Object.fromEntries(fd.entries()),
      driveFolderId: driveFolderId ?? "",
      calendarId: calendarId ?? "",
      avatarUrl: avatarUrl ?? "",
    };
    const res = await fetch(`/api/students/${student.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    setSubmitting(false);
    if (!res.ok) {
      const j = await res.json().catch(() => ({}));
      setError(j.error ?? "Could not save changes");
      return;
    }
    setOpen(false);
    router.refresh();
  }

  async function onDelete() {
    if (
      !confirm(
        `PERMANENTLY DELETE ${student.fullName}?\n\n` +
          "This removes ALL of their tasks, events, channels, comments, " +
          "uploads and history.\n\n" +
          "This action CANNOT be undone. Continue?",
      )
    )
      return;
    setDeleting(true);
    const res = await fetch(`/api/students/${student.id}`, { method: "DELETE" });
    if (!res.ok) {
      const j = await res.json().catch(() => ({}));
      alert(j.error ?? "Could not delete");
      setDeleting(false);
      return;
    }
    router.push("/students");
    router.refresh();
  }

  const dateStr = student.expectedEndDate?.slice(0, 10) ?? "";

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm">
          <Pencil className="h-4 w-4" /> Edit
        </Button>
      </DialogTrigger>
      <DialogContent className="!max-w-xl">
        <DialogHeader>
          <DialogTitle>Edit student</DialogTitle>
        </DialogHeader>
        <form onSubmit={onSubmit} className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <Field label="Full name">
              <Input name="fullName" defaultValue={student.fullName} required />
            </Field>
            <Field label="Alias / nickname">
              <Input
                name="alias"
                defaultValue={student.alias ?? ""}
                placeholder="e.g. Ada"
              />
            </Field>
          </div>
          <p className="text-[11px] text-slate-500 -mt-1">
            The alias is used across the app (sidebars, kanban cards, calendar).
            The full name shows on the profile header and formal listings.
          </p>
          <Field label="Email">
            <Input name="email" type="email" defaultValue={student.email} required />
          </Field>
          <div className="grid grid-cols-3 gap-3">
            <Field label="Program year">
              <Select name="programYear" defaultValue={String(student.programYear)}>
                {[1, 2, 3, 4, 5, 6].map((y) => (
                  <option key={y} value={y}>Year {y}</option>
                ))}
              </Select>
            </Field>
            <Field label="Status">
              <Select name="status" defaultValue={student.status}>
                <option value="active">Active</option>
                <option value="on_leave">On leave</option>
                <option value="submitted">Submitted</option>
                <option value="graduated">Graduated</option>
                <option value="withdrawn">Withdrawn</option>
              </Select>
            </Field>
            <Field label="Expected end">
              <Input name="expectedEndDate" type="date" defaultValue={dateStr} />
            </Field>
          </div>
          <Field label="Color">
            <div className="flex items-center gap-2">
              <input
                name="color"
                type="color"
                defaultValue={student.color}
                className="h-9 w-12 cursor-pointer rounded border bg-white"
              />
              <span className="text-xs text-slate-500">
                Used for avatars, kanban stripes, calendar dots.
              </span>
            </div>
          </Field>
          <Field label="Thesis title">
            <Textarea
              name="thesisTitle"
              rows={2}
              defaultValue={student.thesisTitle ?? ""}
              placeholder="Working title…"
            />
          </Field>
          <Field label="Research area">
            <Input
              name="researchArea"
              defaultValue={student.researchArea ?? ""}
              placeholder="e.g. Analog IC design"
            />
          </Field>
          <Field label="LinkedIn profile">
            <Input
              name="linkedinUrl"
              defaultValue={student.linkedinUrl ?? ""}
              placeholder="https://www.linkedin.com/in/ada-lovelace  (or just the handle)"
            />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="ORCID">
              <Input
                name="orcidId"
                defaultValue={student.orcidId ?? ""}
                placeholder="0000-0002-1825-0097"
              />
            </Field>
            <Field label="Personal website">
              <Input
                name="websiteUrl"
                defaultValue={student.websiteUrl ?? ""}
                placeholder="adalovelace.org"
              />
            </Field>
          </div>
          <Field label="Profile photo">
            <AvatarUploader
              studentId={student.id}
              name={student.fullName}
              color={student.color}
              avatarUrl={avatarUrl}
              onChange={setAvatarUrl}
            />
          </Field>
          {canPickResources && (
            <>
              <Field label="Google Drive folder">
                <DriveFolderPicker
                  value={driveFolderId}
                  onChange={(id) => setDriveFolderId(id)}
                />
              </Field>
              <Field label="Google Calendar">
                <GoogleCalendarPicker
                  value={calendarId}
                  onChange={(id) => setCalendarId(id)}
                />
              </Field>
            </>
          )}

          {error && (
            <div className="text-sm text-[var(--c-red)] bg-red-50 rounded-lg p-3">
              {error}
            </div>
          )}

          <div className="flex justify-between gap-2 pt-2 border-t">
            {canDelete ? (
              <Button
                type="button"
                variant="danger"
                size="sm"
                onClick={onDelete}
                disabled={deleting}
              >
                <Trash2 className="h-4 w-4" />
                {deleting ? "Deleting…" : "Delete student"}
              </Button>
            ) : (
              <span />
            )}
            <div className="flex gap-2">
              <Button
                type="button"
                variant="outline"
                onClick={() => setOpen(false)}
              >
                Cancel
              </Button>
              <Button type="submit" variant="brand" disabled={submitting}>
                {submitting ? "Saving…" : "Save changes"}
              </Button>
            </div>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <label className="block">
      <span className="text-xs font-semibold text-slate-700">{label}</span>
      <div className="mt-1">{children}</div>
    </label>
  );
}
