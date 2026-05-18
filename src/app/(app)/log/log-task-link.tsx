"use client";
import { useState } from "react";
import { KanbanSquare } from "lucide-react";
import { TaskPeek } from "@/components/task-peek";

/**
 * "open task" trigger in the Log book. Opens the task in place (a peek
 * dialog) so closing it keeps you in the Log module; the peek itself has
 * an "Open in Tasks board" button to jump to full editing.
 */
export function LogTaskLink({ ticketId }: { ticketId: string }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="flex items-center gap-1 text-[var(--c-orange)] hover:underline"
      >
        <KanbanSquare className="h-3 w-3" /> open task
      </button>
      <TaskPeek
        ticketId={open ? ticketId : null}
        onClose={() => setOpen(false)}
      />
    </>
  );
}
