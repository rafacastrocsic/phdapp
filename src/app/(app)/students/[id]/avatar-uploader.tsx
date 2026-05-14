"use client";
import { useRef, useState } from "react";
import { Camera, X, Upload } from "lucide-react";
import { Avatar } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";

export function AvatarUploader({
  studentId,
  name,
  color,
  avatarUrl,
  onChange,
}: {
  studentId: string;
  name: string;
  color: string;
  avatarUrl: string | null;
  onChange: (url: string | null) => void;
}) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onPick(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    if (!f) return;
    setError(null);
    if (f.size > 5 * 1024 * 1024) {
      setError("Image must be under 5 MB.");
      return;
    }
    if (!f.type.startsWith("image/")) {
      setError("Pick an image file (PNG, JPG, WebP).");
      return;
    }
    setUploading(true);
    const fd = new FormData();
    fd.append("file", f);
    const r = await fetch(`/api/students/${studentId}/avatar`, {
      method: "POST",
      body: fd,
    });
    setUploading(false);
    if (!r.ok) {
      const j = await r.json().catch(() => ({}));
      setError(j.error ?? "Upload failed");
      return;
    }
    const { url } = await r.json();
    onChange(url);
    if (fileRef.current) fileRef.current.value = "";
  }

  return (
    <div className="flex items-center gap-4">
      <div className="relative">
        <Avatar name={name} src={avatarUrl} color={color} size="lg" className="!h-20 !w-20 !text-xl" />
        <button
          type="button"
          onClick={() => fileRef.current?.click()}
          disabled={uploading}
          className="absolute -bottom-1 -right-1 flex h-7 w-7 items-center justify-center rounded-full bg-white border shadow text-slate-700 hover:bg-slate-50"
          title="Upload photo"
        >
          <Camera className="h-3.5 w-3.5" />
        </button>
      </div>
      <div className="flex-1 min-w-0">
        <input
          ref={fileRef}
          type="file"
          accept="image/*"
          onChange={onPick}
          className="hidden"
        />
        <div className="flex flex-wrap items-center gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => fileRef.current?.click()}
            disabled={uploading}
          >
            <Upload className="h-4 w-4" />
            {uploading ? "Uploading…" : avatarUrl ? "Replace" : "Upload photo"}
          </Button>
          {avatarUrl && (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => onChange(null)}
              disabled={uploading}
            >
              <X className="h-4 w-4" /> Remove
            </Button>
          )}
        </div>
        <p className="text-[11px] text-slate-500 mt-1">
          PNG, JPG or WebP, up to 5 MB.
        </p>
        {error && <p className="text-xs text-[var(--c-red)] mt-1">{error}</p>}
      </div>
    </div>
  );
}
