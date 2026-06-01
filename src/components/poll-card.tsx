"use client";
import { useState } from "react";
import { Lock, Check, MoreHorizontal, X, RotateCcw } from "lucide-react";
import * as DropdownMenu from "@radix-ui/react-dropdown-menu";
import { Avatar } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { cn, relativeTime } from "@/lib/utils";
import { chatTimestamp } from "@/lib/utils";

export interface PollVoter {
  userId: string;
  name: string | null;
  image: string | null;
  color: string;
}

export interface Poll {
  id: string;
  question: string;
  multiVote: boolean;
  closesAt: string | null;
  closedAt: string | null;
  createdById: string;
  options: {
    id: string;
    text: string;
    order: number;
    votes: PollVoter[];
  }[];
}

/**
 * PollCard renders inside a chat message bubble. Non-anonymous —
 * voter avatars stack under each option. Running totals visible at
 * all times. Click an option to toggle your vote.
 *
 * The author (and admins) get a kebab menu: Close / Re-open / Delete.
 * After deletion the parent message is gone too — we don't render
 * a stub.
 */
export function PollCard({
  poll,
  viewerId,
  viewerIsAdmin,
  mine,
  onPollChange,
  onPollDelete,
}: {
  poll: Poll;
  viewerId: string;
  viewerIsAdmin: boolean;
  /** True when this poll's parent message belongs to the viewer
   *  (drives bubble bg/text contrast). */
  mine: boolean;
  /** Called after a successful vote/close/reopen with the fresh poll. */
  onPollChange: (poll: Poll) => void;
  /** Called after a successful delete so the parent can splice it
   *  + its message out of the list. */
  onPollDelete: () => void;
}) {
  const [busy, setBusy] = useState(false);

  const totalVotes = poll.options.reduce(
    (sum, o) => sum + o.votes.length,
    0,
  );
  const isClosed =
    !!poll.closedAt ||
    (poll.closesAt && new Date(poll.closesAt) <= new Date());
  const isAuthor = poll.createdById === viewerId;
  const canManage = isAuthor || viewerIsAdmin;

  async function vote(optionId: string) {
    if (isClosed || busy) return;
    setBusy(true);
    try {
      const r = await fetch(`/api/polls/${poll.id}/vote`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ optionId }),
      });
      if (!r.ok) return;
      const j = await r.json();
      if (j.poll) onPollChange(j.poll as Poll);
    } finally {
      setBusy(false);
    }
  }

  async function setClosed(close: boolean) {
    setBusy(true);
    try {
      const r = await fetch(`/api/polls/${poll.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ close }),
      });
      if (!r.ok) return;
      const j = await r.json();
      if (j.poll) onPollChange(j.poll as Poll);
    } finally {
      setBusy(false);
    }
  }

  async function del() {
    if (
      !confirm(
        totalVotes > 0
          ? `This poll has ${totalVotes} vote${totalVotes === 1 ? "" : "s"}. Delete anyway?`
          : "Delete this poll?",
      )
    )
      return;
    setBusy(true);
    try {
      const r = await fetch(`/api/polls/${poll.id}`, { method: "DELETE" });
      if (!r.ok) return;
      onPollDelete();
    } finally {
      setBusy(false);
    }
  }

  return (
    <div
      className={cn(
        "mt-1 rounded-xl border bg-white p-3 text-sm text-slate-800 shadow-sm",
        // When the parent bubble is the viewer's own (violet bg),
        // keep the card white so the card content is readable —
        // chat bubbles use violet for "mine" which would kill any
        // poll color.
        mine && "border-violet-200",
      )}
    >
      <div className="flex items-start gap-2">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5 text-[11px] font-semibold uppercase text-slate-500">
            <span>📊 Poll</span>
            {isClosed && (
              <span className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-1.5 py-0.5 text-[9px] text-slate-600">
                <Lock className="h-3 w-3" /> Closed
              </span>
            )}
            {poll.multiVote && !isClosed && (
              <span className="rounded-full bg-violet-100 px-1.5 py-0.5 text-[9px] text-violet-700">
                Multi-vote
              </span>
            )}
          </div>
          <div className="mt-0.5 font-semibold text-slate-900 break-words [overflow-wrap:anywhere]">
            {poll.question}
          </div>
        </div>
        {canManage && (
          <DropdownMenu.Root>
            <DropdownMenu.Trigger asChild>
              <button
                type="button"
                className="-mr-1 -mt-1 inline-flex h-7 w-7 items-center justify-center rounded-full text-slate-400 hover:bg-slate-100 hover:text-slate-700"
                title="Poll actions"
              >
                <MoreHorizontal className="h-4 w-4" />
              </button>
            </DropdownMenu.Trigger>
            <DropdownMenu.Portal>
              <DropdownMenu.Content
                align="end"
                className="z-50 min-w-[10rem] rounded-lg border bg-white p-1 shadow-md"
              >
                {isClosed ? (
                  <DropdownMenu.Item
                    onSelect={() => setClosed(false)}
                    className="flex cursor-pointer items-center gap-2 rounded px-2 py-1.5 text-sm hover:bg-slate-100"
                  >
                    <RotateCcw className="h-3.5 w-3.5" /> Re-open poll
                  </DropdownMenu.Item>
                ) : (
                  <DropdownMenu.Item
                    onSelect={() => setClosed(true)}
                    className="flex cursor-pointer items-center gap-2 rounded px-2 py-1.5 text-sm hover:bg-slate-100"
                  >
                    <Lock className="h-3.5 w-3.5" /> Close poll
                  </DropdownMenu.Item>
                )}
                <DropdownMenu.Separator className="my-1 h-px bg-slate-200" />
                <DropdownMenu.Item
                  onSelect={del}
                  className="flex cursor-pointer items-center gap-2 rounded px-2 py-1.5 text-sm text-[var(--c-red)] hover:bg-red-50"
                >
                  <X className="h-3.5 w-3.5" /> Delete poll
                </DropdownMenu.Item>
              </DropdownMenu.Content>
            </DropdownMenu.Portal>
          </DropdownMenu.Root>
        )}
      </div>

      <ul className="mt-2 space-y-1.5">
        {poll.options.map((o) => {
          const count = o.votes.length;
          const pct = totalVotes === 0 ? 0 : Math.round((count / totalVotes) * 100);
          const youVoted = o.votes.some((v) => v.userId === viewerId);
          return (
            <li key={o.id}>
              <button
                type="button"
                onClick={() => vote(o.id)}
                disabled={isClosed || busy}
                className={cn(
                  "relative w-full overflow-hidden rounded-lg border px-2.5 py-1.5 text-left transition-colors",
                  isClosed
                    ? "cursor-default border-slate-200 bg-slate-50"
                    : "cursor-pointer border-slate-200 bg-white hover:border-violet-300 hover:bg-violet-50/30",
                  youVoted && "border-violet-400 bg-violet-50",
                )}
              >
                {/* Vote-bar fill, sits behind the row contents. */}
                <div
                  aria-hidden
                  className={cn(
                    "absolute inset-y-0 left-0 transition-[width] duration-300",
                    youVoted ? "bg-violet-100" : "bg-slate-100/80",
                  )}
                  style={{ width: `${pct}%` }}
                />
                <div className="relative flex items-center gap-2">
                  <div
                    className={cn(
                      "flex h-4 w-4 shrink-0 items-center justify-center rounded-full border",
                      youVoted
                        ? "border-violet-500 bg-violet-500 text-white"
                        : "border-slate-300 bg-white",
                    )}
                  >
                    {youVoted && <Check className="h-3 w-3" />}
                  </div>
                  <span className="flex-1 text-[13px] font-medium text-slate-800 break-words [overflow-wrap:anywhere]">
                    {o.text}
                  </span>
                  <span className="shrink-0 text-[11px] font-semibold tabular-nums text-slate-600">
                    {count} · {pct}%
                  </span>
                </div>
                {/* Voter avatars under the row — non-anonymous policy. */}
                {o.votes.length > 0 && (
                  <div className="relative mt-1 flex flex-wrap items-center gap-1">
                    {o.votes.slice(0, 6).map((v) => (
                      <span
                        key={v.userId}
                        title={v.name ?? ""}
                        className="inline-block"
                      >
                        <Avatar
                          name={v.name ?? "?"}
                          src={v.image}
                          color={v.color}
                          size="sm"
                          className="!h-4 !w-4 !text-[8px]"
                        />
                      </span>
                    ))}
                    {o.votes.length > 6 && (
                      <span className="text-[10px] text-slate-500">
                        +{o.votes.length - 6}
                      </span>
                    )}
                  </div>
                )}
              </button>
            </li>
          );
        })}
      </ul>

      <div className="mt-2 flex flex-wrap items-center gap-2 text-[11px] text-slate-500">
        <span>
          {totalVotes} vote{totalVotes === 1 ? "" : "s"}
        </span>
        {poll.closesAt && !isClosed && (
          <>
            <span aria-hidden>·</span>
            <span title={chatTimestamp(poll.closesAt)}>
              closes {relativeTime(poll.closesAt)}
            </span>
          </>
        )}
        {isClosed && poll.closedAt && (
          <>
            <span aria-hidden>·</span>
            <span title={chatTimestamp(poll.closedAt)}>
              closed {relativeTime(poll.closedAt)}
            </span>
          </>
        )}
      </div>
    </div>
  );
}
