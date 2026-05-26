import { NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { teamLevelForStudent, isAdmin, type Role } from "@/lib/access";

const Patch = z.object({
  title: z.string().min(1).optional(),
  authors: z.string().nullable().optional(),
  url: z.string().nullable().optional(),
  // Status transitions: proposed → approved|rejected (supervisor only),
  // approved → reading → done (student-only; supervisors don't read
  // on the students behalf).
  status: z.enum(["proposed", "approved", "reading", "done", "rejected"]).optional(),
  decisionNote: z.string().nullable().optional(),
  // The "Why I'm proposing this" note set by the proposer at creation
  // time. Editable AFTER creation by the original proposer only.
  proposalNote: z.string().nullable().optional(),
});

const authorSel = { select: { id: true, name: true, image: true, color: true } };

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string; itemId: string }> },
) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "unauth" }, { status: 401 });
  const { id, itemId } = await params;
  const level = await teamLevelForStudent(id, session.user.id, session.user.role as Role);
  if (level !== "supervisor" && level !== "self")
    return NextResponse.json({ error: "forbidden" }, { status: 403 });

  const existing = await prisma.readingItem.findFirst({
    where: { id: itemId, studentId: id },
  });
  if (!existing) return NextResponse.json({ error: "not found" }, { status: 404 });

  const parsed = Patch.safeParse(await req.json().catch(() => null));
  if (!parsed.success)
    return NextResponse.json({ error: "bad input" }, { status: 400 });
  const d = parsed.data;

  const data: Record<string, unknown> = {};
  if (d.title !== undefined) data.title = d.title;
  if (d.authors !== undefined) data.authors = d.authors;
  if (d.url !== undefined) data.url = d.url;

  if (d.status !== undefined) {
    const decisionStatuses = new Set(["approved", "rejected"]);
    const readingProgressStatuses = new Set(["reading", "done"]);
    // Approving / rejecting a proposal is a supervisor-only action.
    if (
      existing.status === "proposed" &&
      decisionStatuses.has(d.status) &&
      level !== "supervisor"
    )
      return NextResponse.json(
        { error: "Only a supervisor can approve or reject a proposal" },
        { status: 403 },
      );
    // Marking an item as "reading" or "done" is the student's
    // self-report. Supervisors shouldn't move items on behalf of
    // the student (supervisors don't actually read in the student's
    // place — they confirm / accompany).
    if (readingProgressStatuses.has(d.status) && level !== "self")
      return NextResponse.json(
        { error: "Only the student can mark a reading as in-progress or done" },
        { status: 403 },
      );
    data.status = d.status;
    if (decisionStatuses.has(d.status)) {
      data.decisionById = session.user.id;
      if (d.decisionNote !== undefined) data.decisionNote = d.decisionNote;
    }
  } else if (d.decisionNote !== undefined) {
    data.decisionNote = d.decisionNote;
  }

  // proposalNote is editable AFTER creation by the original proposer
  // only (and admin). Supervisors moderating someone else's
  // proposal must use the decisionNote field instead.
  if (d.proposalNote !== undefined) {
    if (existing.addedById !== session.user.id && !isAdmin(session.user.role))
      return NextResponse.json(
        { error: "Only the original proposer can edit the proposal note" },
        { status: 403 },
      );
    data.proposalNote = d.proposalNote;
  }

  const item = await prisma.readingItem.update({
    where: { id: itemId },
    data,
    include: { addedBy: authorSel, decisionBy: authorSel },
  });

  // A decision (approve/reject) notifies the other side via the Reading bubble.
  if (
    d.status &&
    (d.status === "approved" || d.status === "rejected") &&
    existing.status !== d.status
  ) {
    const { logActivity } = await import("@/lib/activity-log");
    await logActivity({
      actorId: session.user.id,
      actorRole: session.user.role,
      studentId: id,
      action: "reading.decision",
      entityType: "reading",
      entityId: item.id,
      summary: `${d.status} the reading “${item.title}”`,
    }).catch(() => {});
  }

  return NextResponse.json({ item });
}

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string; itemId: string }> },
) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "unauth" }, { status: 401 });
  const { id, itemId } = await params;
  const level = await teamLevelForStudent(id, session.user.id, session.user.role as Role);
  if (level === null) return NextResponse.json({ error: "not found" }, { status: 404 });

  const existing = await prisma.readingItem.findFirst({
    where: { id: itemId, studentId: id },
    select: { id: true, addedById: true, title: true },
  });
  if (!existing) return NextResponse.json({ error: "not found" }, { status: 404 });

  const canDelete =
    level === "supervisor" ||
    existing.addedById === session.user.id ||
    isAdmin(session.user.role);
  if (!canDelete)
    return NextResponse.json({ error: "forbidden" }, { status: 403 });

  await prisma.readingItem.delete({ where: { id: itemId } });

  // Activity log → drives the Reading sidebar bubble + 🔔 bell for the other side.
  const { logActivity } = await import("@/lib/activity-log");
  await logActivity({
    actorId: session.user.id,
    actorRole: session.user.role,
    studentId: id,
    action: "reading.delete",
    entityType: "reading",
    entityId: existing.id,
    summary: `removed the reading “${existing.title}”`,
  }).catch(() => {});

  return NextResponse.json({ ok: true });
}
