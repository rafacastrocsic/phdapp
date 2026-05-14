"use client";
import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { ProfileEditor } from "@/components/profile-editor";

interface UserRow {
  id: string;
  name: string | null;
  email: string;
  image: string | null;
  color: string;
  role: string;
}

export function TeamUserCard({
  user,
  isMe,
  isAdmin,
  metric,
  children,
}: {
  user: UserRow;
  isMe: boolean;
  isAdmin: boolean;
  metric: string;
  children?: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const canOpen = isAdmin || isMe;

  return (
    <>
      <button
        type="button"
        disabled={!canOpen}
        onClick={() => canOpen && setOpen(true)}
        className={
          "w-full text-left flex items-center gap-3 rounded-xl border p-3 transition-all " +
          (canOpen
            ? "hover:shadow-md hover:-translate-y-0.5 cursor-pointer"
            : "cursor-default opacity-95")
        }
        title={
          canOpen
            ? "Click to edit profile"
            : "Only the admin or this user can edit their profile"
        }
      >
        {children}
      </button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="!max-w-xl">
          <DialogHeader>
            <DialogTitle>
              Edit profile · {user.name ?? user.email}
              {isMe && <span className="text-sm text-slate-400 ml-2">(you)</span>}
            </DialogTitle>
          </DialogHeader>
          <ProfileEditor
            user={user}
            canEditRole={isAdmin}
            isSelf={isMe}
          />
          <p className="text-[11px] text-slate-500 mt-3">
            {metric}
          </p>
        </DialogContent>
      </Dialog>
    </>
  );
}
