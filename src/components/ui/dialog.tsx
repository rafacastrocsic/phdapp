"use client";
import * as React from "react";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import { X } from "lucide-react";
import { cn } from "@/lib/utils";

export const Dialog = DialogPrimitive.Root;
export const DialogTrigger = DialogPrimitive.Trigger;
export const DialogClose = DialogPrimitive.Close;

export function DialogContent({
  children,
  className,
  ...props
}: React.ComponentProps<typeof DialogPrimitive.Content>) {
  return (
    <DialogPrimitive.Portal>
      <DialogPrimitive.Overlay className="fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-sm data-[state=open]:animate-in data-[state=closed]:animate-out" />
      {/* Two layouts in one — driven by Tailwind breakpoints, no JS:
          - Mobile (< md): dock to the bottom of the viewport as a
            bottom sheet. Full width, rounded top corners only,
            slides up from the bottom edge. Feels native, keeps the
            thumb close to the dialog actions, and avoids the
            awkward centered-over-keyboard problem when an input has
            focus on a phone.
          - Desktop (md+): unchanged centered modal at max-w-lg.
          Both modes respect env(safe-area-inset-bottom) so iPhone
          home-indicator areas don't overlap the dialog content. */}
      <DialogPrimitive.Content
        className={cn(
          "fixed z-50 bg-white shadow-xl border overflow-y-auto",
          // Mobile bottom-sheet defaults — overridden by md: below.
          "inset-x-0 bottom-0 w-full max-h-[92vh] rounded-t-2xl p-5 pb-[max(1.25rem,env(safe-area-inset-bottom))]",
          // Desktop centered modal — mirrors the old behavior.
          "md:left-1/2 md:top-1/2 md:bottom-auto md:inset-x-auto md:-translate-x-1/2 md:-translate-y-1/2 md:w-[92vw] md:max-w-lg md:max-h-[90vh] md:rounded-2xl md:p-6 md:pb-6",
          className,
        )}
        {...props}
      >
        {/* Drag-handle visual cue on mobile only — communicates
            "this is a sheet" without being interactive. */}
        <div
          aria-hidden
          className="mx-auto mb-3 h-1 w-10 rounded-full bg-slate-200 md:hidden"
        />
        {children}
        <DialogPrimitive.Close
          className="absolute right-3 top-3 inline-flex h-9 w-9 items-center justify-center rounded-md text-slate-400 hover:text-slate-700 hover:bg-slate-100 md:right-4 md:top-4 md:h-7 md:w-7"
          aria-label="Close"
        >
          <X className="h-4 w-4" />
        </DialogPrimitive.Close>
      </DialogPrimitive.Content>
    </DialogPrimitive.Portal>
  );
}

export function DialogHeader({
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("mb-4", className)} {...props} />;
}

export function DialogTitle({
  className,
  ...props
}: React.ComponentProps<typeof DialogPrimitive.Title>) {
  return (
    <DialogPrimitive.Title
      className={cn("text-lg font-semibold text-slate-900", className)}
      {...props}
    />
  );
}

export function DialogDescription({
  className,
  ...props
}: React.ComponentProps<typeof DialogPrimitive.Description>) {
  return (
    <DialogPrimitive.Description
      className={cn("text-sm text-slate-500 mt-1", className)}
      {...props}
    />
  );
}
