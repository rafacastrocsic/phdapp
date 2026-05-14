"use client";
import * as React from "react";
import { cn } from "@/lib/utils";

type ShowPickerInput = HTMLInputElement & { showPicker?: () => void };

export const Input = React.forwardRef<
  HTMLInputElement,
  React.InputHTMLAttributes<HTMLInputElement>
>(({ className, type, onClick, onFocus, ...props }, ref) => {
  const isPickerType =
    type === "date" || type === "time" || type === "datetime-local" || type === "month" || type === "week";

  function maybeShowPicker(el: ShowPickerInput | null) {
    if (!el) return;
    try {
      el.showPicker?.();
    } catch {
      // showPicker can throw if input isn't focused or has user-gesture restrictions; ignore
    }
  }

  return (
    <input
      ref={ref}
      type={type}
      onClick={(e) => {
        if (isPickerType) maybeShowPicker(e.currentTarget);
        onClick?.(e);
      }}
      onFocus={(e) => {
        if (isPickerType) maybeShowPicker(e.currentTarget);
        onFocus?.(e);
      }}
      className={cn(
        "h-9 w-full rounded-lg border bg-white px-3 text-sm text-slate-900 placeholder:text-slate-400 focus:border-[var(--ring)] focus:outline-none focus:ring-2 focus:ring-[var(--ring)]/20",
        // Hide the native calendar/clock icon for picker inputs so the whole
        // field looks like one big clickable target.
        isPickerType &&
          "[&::-webkit-calendar-picker-indicator]:hidden [&::-webkit-calendar-picker-indicator]:appearance-none cursor-pointer",
        className,
      )}
      {...props}
    />
  );
});
Input.displayName = "Input";

export const Textarea = React.forwardRef<
  HTMLTextAreaElement,
  React.TextareaHTMLAttributes<HTMLTextAreaElement>
>(({ className, ...props }, ref) => (
  <textarea
    ref={ref}
    className={cn(
      "min-h-[80px] w-full rounded-lg border bg-white px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus:border-[var(--ring)] focus:outline-none focus:ring-2 focus:ring-[var(--ring)]/20",
      className,
    )}
    {...props}
  />
));
Textarea.displayName = "Textarea";

export const Select = React.forwardRef<
  HTMLSelectElement,
  React.SelectHTMLAttributes<HTMLSelectElement>
>(({ className, ...props }, ref) => (
  <select
    ref={ref}
    className={cn(
      "h-9 w-full rounded-lg border bg-white px-3 text-sm text-slate-900 focus:border-[var(--ring)] focus:outline-none focus:ring-2 focus:ring-[var(--ring)]/20",
      className,
    )}
    {...props}
  />
));
Select.displayName = "Select";
