"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { KanbanSquare, ExternalLink } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  STATUSES,
  PRIORITIES,
  CATEGORIES,
  statusColor,
  priorityColor,
  categoryColor,
} from "@/lib/kanban-constants";

interface Subtask {
  id: string;
  text: string;
  done: boolean;
  due?: string | null;
}
interface PeekTicket {
  id: string;
  title: string;
  description: string | null;
  status: string;
  priority: string;
  category: string;
  dueDate: string | null;
  commentCount: number;
  assignee: { id: string; name: string | null } | null;
  student: { fullName: string; alias: string | null } | null;
  subtasks: Subtask[];
}

function label(list: readonly { id: string; label: string }[], id: string) {
  return list.find((x) => x.id === id)?.label ?? id;
}

/**
 * Read-only task viewer opened *in place* from Calendar / Log so closing it
 * keeps you in that module. "Open in Tasks board" is the explicit way to
 * jump to the full editable task on the Tasks board.
 */
export function TaskPeek({
  ticketId,
  onClose,
}: {
  ticketId: string | null;
  onClose: () => void;
}) {
  return (
    <Dialog
      open={!!ticketId}
      onOpenChange={(o) => {
        if (!o) onClose();
      }}
    >
      <DialogContent className="!max-w-lg">
        {ticketId ? (
          <TaskPeekBody key={ticketId} ticketId={ticketId} onClose={onClose} />
        ) : (
          <DialogHeader>
            <DialogTitle>Task</DialogTitle>
          </DialogHeader>
        )}
      </DialogContent>
    </Dialog>
  );
}

function TaskPeekBody({
  ticketId,
  onClose,
}: {
  ticketId: string;
  onClose: () => void;
}) {
  const router = useRouter();
  // Mounted fresh per ticket (keyed), so initial state is the loading state —
  // no synchronous setState in the effect.
  const [ticket, setTicket] = useState<PeekTicket | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch(`/api/tickets/${ticketId}`, { cache: "no-store" })
      .then(async (r) => {
        if (cancelled) return;
        if (!r.ok) {
          setError(
            r.status === 404
              ? "This task no longer exists or you can't see it."
              : "Could not load the task.",
          );
          return;
        }
        const j = await r.json();
        if (!cancelled) setTicket(j.ticket);
      })
      .catch(() => {
        if (!cancelled) setError("Could not load the task.");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [ticketId]);

  const done = ticket?.subtasks.filter((s) => s.done).length ?? 0;

  return (
    <>
      <DialogHeader>
        <DialogTitle>{ticket?.title ?? "Task"}</DialogTitle>
      </DialogHeader>

      {loading && <p className="py-6 text-sm text-slate-400">Loading task…</p>}
      {error && (
        <div className="text-sm text-[var(--c-red)] bg-red-50 rounded-lg p-3">
          {error}
        </div>
      )}

      {ticket && (
        <div className="space-y-3 text-sm">
          <div className="flex flex-wrap gap-1.5">
            <Badge color={statusColor(ticket.status)}>
              {label(STATUSES, ticket.status)}
            </Badge>
            <Badge color={priorityColor(ticket.priority)}>
              {label(PRIORITIES, ticket.priority)}
            </Badge>
            <Badge color={categoryColor(ticket.category)}>
              {label(CATEGORIES, ticket.category)}
            </Badge>
            {ticket.dueDate && (
              <Badge color="#64748b">
                due{" "}
                {new Date(ticket.dueDate).toLocaleDateString(undefined, {
                  month: "short",
                  day: "numeric",
                })}
              </Badge>
            )}
          </div>

          <div className="text-xs text-slate-500">
            {ticket.student && (
              <span>
                Student:{" "}
                {ticket.student.alias?.trim() || ticket.student.fullName}
              </span>
            )}
            {ticket.assignee && (
              <span> · Assignee: {ticket.assignee.name ?? "—"}</span>
            )}
          </div>

          {ticket.description && (
            <div className="rounded-lg bg-slate-50 p-3 text-slate-700 whitespace-pre-wrap">
              {ticket.description}
            </div>
          )}

          {ticket.subtasks.length > 0 && (
            <div>
              <div className="text-xs font-semibold text-slate-700 mb-1">
                Subtasks {done}/{ticket.subtasks.length}
              </div>
              <ul className="space-y-1">
                {ticket.subtasks.map((s) => (
                  <li
                    key={s.id}
                    className="flex items-center gap-2 text-sm text-slate-700"
                  >
                    <span className="text-slate-400">
                      {s.done ? "☑" : "☐"}
                    </span>
                    <span
                      className={s.done ? "line-through text-slate-400" : ""}
                    >
                      {s.text}
                    </span>
                    {s.due && (
                      <span className="text-[10px] text-slate-400">
                        ·{" "}
                        {new Date(s.due + "T00:00:00").toLocaleDateString(
                          undefined,
                          { month: "short", day: "numeric" },
                        )}
                      </span>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {ticket.commentCount > 0 && (
            <p className="text-xs text-slate-400">
              {ticket.commentCount} comment
              {ticket.commentCount === 1 ? "" : "s"} — open in the Tasks board
              to read/reply.
            </p>
          )}
        </div>
      )}

      <div className="flex items-center justify-between gap-2 pt-3 mt-3 border-t">
        <Button
          type="button"
          variant="brand"
          size="sm"
          disabled={!ticket}
          onClick={() => {
            if (ticket) router.push(`/kanban?ticket=${ticket.id}`);
          }}
        >
          <KanbanSquare className="h-4 w-4" /> Open in Tasks board
          <ExternalLink className="h-3.5 w-3.5" />
        </Button>
        <Button type="button" variant="outline" size="sm" onClick={onClose}>
          Close
        </Button>
      </div>
    </>
  );
}
