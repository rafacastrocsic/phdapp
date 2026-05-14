"use client";
import * as DropdownMenu from "@radix-ui/react-dropdown-menu";
import Link from "next/link";
import { LogOut, User as UserIcon, Settings } from "lucide-react";
import { signOutAction } from "./signout-action";

export function UserMenu({
  profileHref,
  profileLabel,
  children,
  showSettings = true,
}: {
  profileHref: string;
  profileLabel: string;
  children: React.ReactNode;
  showSettings?: boolean;
}) {
  return (
    <DropdownMenu.Root>
      <DropdownMenu.Trigger asChild>{children}</DropdownMenu.Trigger>
      <DropdownMenu.Portal>
        <DropdownMenu.Content
          align="end"
          sideOffset={8}
          className="z-50 min-w-[220px] rounded-xl border bg-white p-1 shadow-lg"
        >
          <DropdownMenu.Item asChild>
            <Link
              href={profileHref}
              className="flex cursor-pointer items-center gap-2 rounded-md px-3 py-2 text-sm text-slate-700 hover:bg-slate-50 focus:bg-slate-50 outline-none"
            >
              <UserIcon className="h-4 w-4 text-slate-500" />
              {profileLabel}
            </Link>
          </DropdownMenu.Item>
          {showSettings && profileHref !== "/settings" && (
            <DropdownMenu.Item asChild>
              <Link
                href="/settings"
                className="flex cursor-pointer items-center gap-2 rounded-md px-3 py-2 text-sm text-slate-700 hover:bg-slate-50 focus:bg-slate-50 outline-none"
              >
                <Settings className="h-4 w-4 text-slate-500" />
                Settings
              </Link>
            </DropdownMenu.Item>
          )}
          <DropdownMenu.Separator className="my-1 h-px bg-slate-100" />
          <DropdownMenu.Item
            onSelect={(e) => {
              // Don't auto-close before the server action fires
              e.preventDefault();
              // Server action; returns a redirect that the browser follows
              signOutAction();
            }}
            className="flex cursor-pointer items-center gap-2 rounded-md px-3 py-2 text-sm text-[var(--c-red)] hover:bg-red-50 focus:bg-red-50 outline-none"
          >
            <LogOut className="h-4 w-4" />
            Sign out
          </DropdownMenu.Item>
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  );
}
