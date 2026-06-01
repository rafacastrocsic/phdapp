import { NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { isAdmin } from "@/lib/access";

// ─── Permission helper ───
// A poll edit / close / delete requires the viewer to (a) be in
// the same channel as the poll's message AND (b) be either the
// poll's author or an admin. The channel-membership check matches
// the rules used elsewhere in chat APIs.
async function loadPollForViewer(
  pollId: string,
  userId: string,
  role: string,
) {
  const poll = await prisma.poll.findUnique({
    where: { id: pollId },
    include: {
      message: {
        select: {
          id: true,
          channelId: true,
          channel: {
            select: {
              id: true,
              kind: true,
              members: { where: { userId }, select: { id: true } },
              student: {
                select: {
                  supervisorId: true,
                  userId: true,
                  coSupervisors: {
                    where: { userId, role: { not: "team_advisor" } },
                    select: { id: true },
                  },
                },
              },
            },
          },
        },
      },
      options: {
        orderBy: { order: "asc" },
        include: {
          votes: {
            include: {
              user: {
                select: { id: true, name: true, image: true, color: true },
              },
            },
          },
        },
      },
    },
  });
  if (!poll) return { error: "not found" as const, status: 404 };

  const ch = poll.message.channel;
  const isMember = ch.members.length > 0;
  const isGeneral = ch.kind === "general";
  const isPrimarySupervisor = ch.student?.supervisorId === userId;
  const isCoSup = (ch.student?.coSupervisors.length ?? 0) > 0;
  const isOwnStudentChannel = ch.student?.userId === userId;
  const canSee =
    isMember || isGeneral || isPrimarySupervisor || isCoSup || isOwnStudentChannel;
  if (!canSee) return { error: "forbidden" as const, status: 403 };

  const isAuthor = poll.createdById === userId;
  const isAdminRole = isAdmin(role);
  const isAuthorOrAdmin = isAuthor || isAdminRole;

  const totalVotes = poll.options.reduce((sum, o) => sum + o.votes.length, 0);
  return {
    poll,
    isAuthor,
    isAdminRole,
    isAuthorOrAdmin,
    hasAnyVote: totalVotes > 0,
  };
}

// Serializer mirrored from /api/channels/[id]/messages so the
// response shape is interchangeable. Typed structurally so the same
// helper accepts both the "loaded with channel context" shape from
// loadPollForViewer (which has poll.message) AND the "just the
// poll" shape used by post-update re-reads.
interface PollSerializeShape {
  id: string;
  question: string;
  multiVote: boolean;
  closesAt: Date | null;
  closedAt: Date | null;
  createdById: string;
  options: {
    id: string;
    text: string;
    order: number;
    votes: {
      user: {
        id: string;
        name: string | null;
        image: string | null;
        color: string;
      };
    }[];
  }[];
}
function serializePoll(poll: PollSerializeShape) {
  return {
    id: poll.id,
    question: poll.question,
    multiVote: poll.multiVote,
    closesAt: poll.closesAt?.toISOString() ?? null,
    closedAt: poll.closedAt?.toISOString() ?? null,
    createdById: poll.createdById,
    options: poll.options.map((o) => ({
      id: o.id,
      text: o.text,
      order: o.order,
      votes: o.votes.map((v) => ({
        userId: v.user.id,
        name: v.user.name,
        image: v.user.image,
        color: v.user.color,
      })),
    })),
  };
}

// ─── PATCH /api/polls/[id] ───
// Multiple admin-style actions go through a single endpoint based
// on which fields are present. Locking rules (see schema comment):
//   - question / multiVote / option *text* edits: blocked once any
//     vote exists (admin override does NOT bypass this).
//   - addOption + reorder: anytime.
//   - removeOption: only if that option has zero votes.
//   - closesAt / close / reopen: anytime.
const Patch = z.object({
  question: z.string().min(1).max(300).optional(),
  multiVote: z.boolean().optional(),
  closesAt: z.string().datetime().nullable().optional(),
  // "close": true → set closedAt=now; "close": false → clear closedAt.
  close: z.boolean().optional(),
  // Bulk option mutations.
  addOptions: z.array(z.string().min(1).max(120)).optional(),
  removeOptionIds: z.array(z.string()).optional(),
  // Reorder is { id: newOrder } — only optionIds in the poll are honoured.
  reorder: z.record(z.string(), z.number().int()).optional(),
  // Single-option text edits — same locking rule as question.
  editOptionText: z
    .array(z.object({ id: z.string(), text: z.string().min(1).max(120) }))
    .optional(),
});

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await auth();
  if (!session?.user)
    return NextResponse.json({ error: "unauth" }, { status: 401 });
  const { id } = await params;
  const ctx = await loadPollForViewer(id, session.user.id, session.user.role);
  if ("error" in ctx)
    return NextResponse.json({ error: ctx.error }, { status: ctx.status });

  if (!ctx.isAuthorOrAdmin)
    return NextResponse.json(
      { error: "Only the poll author or an admin can edit this poll." },
      { status: 403 },
    );

  const parsed = Patch.safeParse(await req.json().catch(() => null));
  if (!parsed.success)
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "bad input" },
      { status: 400 },
    );
  const d = parsed.data;

  // Identify structurally-impactful edits — these are locked once
  // ANY vote has been cast (anti-manipulation rule). Admin override
  // does NOT bypass this; admins can close/delete but not retroactively
  // change the question or option texts/structure after votes exist.
  const structuralEdit =
    d.question !== undefined ||
    d.multiVote !== undefined ||
    (d.editOptionText && d.editOptionText.length > 0) ||
    (d.removeOptionIds && d.removeOptionIds.length > 0);
  if (structuralEdit && ctx.hasAnyVote)
    return NextResponse.json(
      {
        error:
          "Can't change the question, option text, or multi-vote setting after voting has started.",
      },
      { status: 409 },
    );

  // ── Apply changes in a single transaction so partial updates can't
  //    leave the poll in a weird state.
  await prisma.$transaction(async (tx) => {
    const update: Record<string, unknown> = {};
    if (d.question !== undefined) update.question = d.question.trim();
    if (d.multiVote !== undefined) update.multiVote = d.multiVote;
    if (d.closesAt !== undefined)
      update.closesAt = d.closesAt ? new Date(d.closesAt) : null;
    if (d.close !== undefined)
      update.closedAt = d.close ? new Date() : null;
    if (Object.keys(update).length > 0)
      await tx.poll.update({ where: { id }, data: update });

    if (d.editOptionText) {
      for (const op of d.editOptionText) {
        const inPoll = ctx.poll.options.find((o) => o.id === op.id);
        if (!inPoll) continue;
        await tx.pollOption.update({
          where: { id: op.id },
          data: { text: op.text.trim() },
        });
      }
    }
    if (d.removeOptionIds) {
      for (const optId of d.removeOptionIds) {
        const o = ctx.poll.options.find((x) => x.id === optId);
        if (!o) continue;
        // Defensive: refuse to nuke an option with votes even if the
        // overall poll happens to be vote-free (the structuralEdit
        // gate already catches the global case, but a malicious
        // client could try to bypass; this is the last line).
        if (o.votes.length > 0)
          throw new Error(
            `Option "${o.text}" already has votes — can't remove.`,
          );
        await tx.pollOption.delete({ where: { id: optId } });
      }
    }
    if (d.addOptions) {
      const existingCount = ctx.poll.options.length;
      const nextOrder = (existingCount && Math.max(
        ...ctx.poll.options.map((o) => o.order),
      ) + 1) || existingCount;
      const toAdd = d.addOptions
        .map((t) => t.trim())
        .filter((t) => t.length > 0);
      // Dedupe against existing option texts (case-insensitive).
      const existingLower = new Set(
        ctx.poll.options.map((o) => o.text.toLowerCase()),
      );
      const novel = toAdd.filter(
        (t) => !existingLower.has(t.toLowerCase()),
      );
      if (existingCount + novel.length > 10)
        throw new Error("A poll caps at 10 options.");
      await tx.pollOption.createMany({
        data: novel.map((text, i) => ({
          pollId: id,
          text,
          order: nextOrder + i,
        })),
      });
    }
    if (d.reorder) {
      const validIds = new Set(ctx.poll.options.map((o) => o.id));
      for (const [optId, ord] of Object.entries(d.reorder)) {
        if (!validIds.has(optId)) continue;
        await tx.pollOption.update({
          where: { id: optId },
          data: { order: ord },
        });
      }
    }
  });

  // Re-read fresh state for the response.
  const fresh = await prisma.poll.findUnique({
    where: { id },
    include: {
      options: {
        orderBy: { order: "asc" },
        include: {
          votes: {
            include: {
              user: {
                select: { id: true, name: true, image: true, color: true },
              },
            },
          },
        },
      },
    },
  });
  return NextResponse.json({ poll: fresh ? serializePoll(fresh) : null });
}

// ─── DELETE /api/polls/[id] ───
// Deletes the poll AND its parent message. Author + admin only.
// Even after votes exist (the UI surfaces the count in a confirm
// prompt; the server doesn't gatekeep further).
export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await auth();
  if (!session?.user)
    return NextResponse.json({ error: "unauth" }, { status: 401 });
  const { id } = await params;
  const ctx = await loadPollForViewer(id, session.user.id, session.user.role);
  if ("error" in ctx)
    return NextResponse.json({ error: ctx.error }, { status: ctx.status });
  if (!ctx.isAuthorOrAdmin)
    return NextResponse.json(
      { error: "Only the poll author or an admin can delete this poll." },
      { status: 403 },
    );
  // Deleting the message cascades through Poll → PollOption →
  // PollVote (FK ON DELETE CASCADE) so we only need one row.
  await prisma.message.delete({ where: { id: ctx.poll.messageId } });
  return NextResponse.json({ ok: true });
}
