"use client";
import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Camera, Save, Upload, Trash2 } from "lucide-react";
import { Avatar } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input, Select } from "@/components/ui/input";

interface UserRow {
  id: string;
  name: string | null;
  email: string;
  image: string | null;
  color: string;
  role: string;
}

const ROLE_OPTIONS = [
  { id: "admin", label: "Admin" },
  { id: "supervisor", label: "Supervisor" },
  { id: "team_advisor", label: "Team advisor" },
  { id: "student", label: "Student" },
];

export function ProfileEditor({
  user,
  canEditRole,
  isSelf,
}: {
  user: UserRow;
  canEditRole: boolean;
  isSelf: boolean;
}) {
  const [name, setName] = useState(user.name ?? "");
  const [color, setColor] = useState(user.color);
  const [role, setRole] = useState(user.role);
  const [image, setImage] = useState<string | null>(user.image);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [msg, setMsg] = useState<{ type: "ok" | "err"; text: string } | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const router = useRouter();

  async function save() {
    setSaving(true);
    setMsg(null);
    const payload: Record<string, unknown> = { name, color, image };
    if (canEditRole) payload.role = role;
    const r = await fetch(`/api/users/${user.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    setSaving(false);
    if (!r.ok) {
      const j = await r.json().catch(() => ({}));
      setMsg({ type: "err", text: j.error ?? "Could not save" });
      return;
    }
    setMsg({ type: "ok", text: "Saved." });
    router.refresh();
  }

  async function onPickImage(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    if (!f) return;
    setUploading(true);
    setMsg(null);
    const fd = new FormData();
    fd.append("file", f);
    const r = await fetch(`/api/users/${user.id}/avatar`, {
      method: "POST",
      body: fd,
    });
    setUploading(false);
    if (!r.ok) {
      const j = await r.json().catch(() => ({}));
      setMsg({ type: "err", text: j.error ?? "Upload failed" });
      return;
    }
    const { url } = await r.json();
    setImage(url);
    if (fileRef.current) fileRef.current.value = "";
    router.refresh();
  }

  return (
    <div className="space-y-4">
      <div className="flex items-start gap-4">
        <div className="relative">
          <Avatar
            name={name || user.email}
            src={image}
            color={color}
            size="lg"
            className="!h-20 !w-20 !text-xl"
          />
          <button
            type="button"
            onClick={() => fileRef.current?.click()}
            disabled={uploading}
            className="absolute -bottom-1 -right-1 flex h-7 w-7 items-center justify-center rounded-full bg-white border shadow text-slate-700 hover:bg-slate-50"
            title="Upload photo"
          >
            <Camera className="h-3.5 w-3.5" />
          </button>
          <input
            ref={fileRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={onPickImage}
          />
        </div>

        <div className="flex-1 space-y-3">
          <Field label="Display name">
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder={user.email}
            />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Email (read-only)">
              <Input value={user.email} disabled />
            </Field>
            <Field label="Accent color">
              <div className="flex items-center gap-2">
                <input
                  type="color"
                  value={color}
                  onChange={(e) => setColor(e.target.value)}
                  className="h-9 w-12 cursor-pointer rounded border bg-white"
                />
                <span className="text-xs text-slate-500">
                  Used for your avatar background.
                </span>
              </div>
            </Field>
          </div>
          {canEditRole ? (
            <Field label="Role">
              <Select value={role} onChange={(e) => setRole(e.target.value)}>
                {ROLE_OPTIONS.map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.label}
                  </option>
                ))}
              </Select>
              {isSelf && (
                <p className="text-[11px] text-amber-700 bg-amber-50 rounded p-2 mt-1">
                  You can&apos;t demote yourself from admin via this form.
                </p>
              )}
            </Field>
          ) : (
            <Field label="Role">
              <Badge color="#6366f1" variant="solid">
                {user.role.replace("_", " ")}
              </Badge>
            </Field>
          )}
        </div>
      </div>

      {msg && (
        <div
          className={
            msg.type === "ok"
              ? "text-sm text-[var(--c-green)] bg-green-50 rounded-lg p-3"
              : "text-sm text-[var(--c-red)] bg-red-50 rounded-lg p-3"
          }
        >
          {msg.text}
        </div>
      )}

      <div className="flex justify-between gap-2 flex-wrap">
        {canEditRole && !isSelf ? (
          <Button
            type="button"
            variant="danger"
            size="sm"
            onClick={async () => {
              if (
                !confirm(
                  `Permanently delete ${user.name ?? user.email}?\n\nThis removes their account and all their messages, channel memberships and event ownerships. Students they supervise must be reassigned first.`,
                )
              )
                return;
              setSaving(true);
              const r = await fetch(`/api/users/${user.id}`, { method: "DELETE" });
              setSaving(false);
              if (!r.ok) {
                const j = await r.json().catch(() => ({}));
                setMsg({ type: "err", text: j.error ?? "Could not delete" });
                return;
              }
              setMsg({ type: "ok", text: "Deleted." });
              router.refresh();
            }}
          >
            <Trash2 className="h-4 w-4" /> Delete user
          </Button>
        ) : (
          <span />
        )}
        <Button onClick={save} variant="brand" disabled={saving || uploading}>
          <Save className="h-4 w-4" />
          {saving ? "Saving…" : "Save changes"}
        </Button>
      </div>
    </div>
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

export function _UploadIcon() {
  return <Upload className="h-4 w-4" />;
}
