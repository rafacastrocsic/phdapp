"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Plus } from "lucide-react";
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

export function NewStudentDialog({ children }: { children?: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [driveFolderId, setDriveFolderId] = useState<string | null>(null);
  const router = useRouter();

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    const fd = new FormData(e.currentTarget);
    const payload = {
      ...Object.fromEntries(fd.entries()),
      driveFolderId: driveFolderId ?? "",
    };
    const res = await fetch("/api/students", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    setSubmitting(false);
    if (!res.ok) {
      const j = await res.json().catch(() => ({}));
      setError(j.error ?? "Could not create student");
      return;
    }
    setOpen(false);
    router.refresh();
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        {children ?? (
          <Button variant="brand">
            <Plus className="h-4 w-4" /> Add student
          </Button>
        )}
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Add a new PhD student</DialogTitle>
        </DialogHeader>
        <form onSubmit={onSubmit} className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <Field label="Full name">
              <Input name="fullName" required placeholder="Ada Lovelace" />
            </Field>
            <Field label="Alias">
              <Input name="alias" placeholder="Ada" />
            </Field>
          </div>
          <Field label="Email">
            <Input name="email" type="email" required placeholder="ada@uni.edu" />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Program year">
              <Select name="programYear" defaultValue="1">
                {[1, 2, 3, 4, 5].map((y) => (
                  <option key={y} value={y}>
                    Year {y}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Status">
              <Select name="status" defaultValue="active">
                <option value="active">Active</option>
                <option value="on_leave">On leave</option>
                <option value="submitted">Submitted</option>
                <option value="graduated">Graduated</option>
                <option value="withdrawn">Withdrawn</option>
              </Select>
            </Field>
          </div>
          <Field label="Thesis title (optional)">
            <Textarea name="thesisTitle" rows={2} placeholder="Working title…" />
          </Field>
          <Field label="Research area (optional)">
            <Input name="researchArea" placeholder="e.g. Analog IC design" />
          </Field>
          <Field label="Google Drive folder (optional)">
            <DriveFolderPicker
              value={driveFolderId}
              onChange={(id) => setDriveFolderId(id)}
            />
          </Field>
          <Field label="Calendar ID (optional)">
            <Input
              name="calendarId"
              placeholder="leave blank to use your primary"
            />
          </Field>

          {error && (
            <div className="text-sm text-[var(--c-red)] bg-red-50 rounded-lg p-3">
              {error}
            </div>
          )}

          <div className="flex justify-end gap-2 pt-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => setOpen(false)}
            >
              Cancel
            </Button>
            <Button type="submit" variant="brand" disabled={submitting}>
              {submitting ? "Adding…" : "Add student"}
            </Button>
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
