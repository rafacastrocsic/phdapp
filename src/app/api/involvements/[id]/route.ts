import { NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { type Role } from "@/lib/access";
import { LinkInput, sanitiseLinks } from "@/lib/links";
import {
  resolveStudentRef,
  resolveTaskRef,
  resolveEventRef,
} from "@/lib/involvement-refs";
import {
  ChecklistInput,
  sanitiseChecklist,
  checklistProgress,
} from "@/lib/involvement-checklist";

const Patch = z.object({
  title: z.string().min(1).max(300).optional(),
  notes: z.string().max(20000).nullable().optional(),
  progress: z.number().int().min(0).max(100).optional(),
  checklist: ChecklistInput.optional(),
  status: z.enum(["active", "paused", "done"]).optional(),
  shared: z.boolean().optional(),
  pinned: z.boolean().optional(),
  links: z.array(LinkInput).optional(),
  driveFolderUrl: z.string().nullable().optional(),
  studentId: z.string().nullable().optional(),
  linkedTaskId: z.string().nullable().optional(),
  linkedEventId: z.string().nullable().optional(),
});

// Only the owner may edit or delete their involvement.
async function loadOwned(id: string, userId: string) {
  const item = await prisma.involvement.findUnique({
    where: { id },
    select: { id: true, ownerId: true },
  });
  if (!item) return { item: null, owned: false };
  return { item, owned: item.ownerId === userId };
}

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await auth();
  if (!session?.user)
    return NextResponse.json({ error: "unauth" }, { status: 401 });
  const { id } = await params;
  const role = session.user.role as Role;
  const { item, owned } = await loadOwned(id, session.user.id);
  if (!item) return NextResponse.json({ error: "not found" }, { status: 404 });
  if (!owned)
    return NextResponse.json(
      { error: "You can only edit your own involvements." },
      { status: 403 },
    );

  const parsed = Patch.safeParse(await req.json().catch(() => null));
  if (!parsed.success)
    return NextResponse.json({ error: "bad input" }, { status: 400 });
  const d = parsed.data;

  const data: Record<string, unknown> = {};
  if (d.title !== undefined) data.title = d.title.trim();
  if (d.notes !== undefined) data.notes = d.notes?.trim() || null;
  // Checklist wins over a manual progress value: when a non-empty checklist
  // is sent, derive progress from it; when cleared to empty, fall back to
  // the manual value if one was provided.
  if (d.checklist !== undefined) {
    const cl = sanitiseChecklist(d.checklist);
    data.checklist = cl.length > 0 ? JSON.stringify(cl) : null;
    if (cl.length > 0) data.progress = checklistProgress(cl);
    else if (d.progress !== undefined) data.progress = d.progress;
  } else if (d.progress !== undefined) {
    data.progress = d.progress;
  }
  if (d.status !== undefined) data.status = d.status;
  if (d.shared !== undefined) data.shared = d.shared;
  if (d.pinned !== undefined) data.pinned = d.pinned;
  if (d.links !== undefined) {
    const sane = sanitiseLinks(d.links);
    data.links = sane.length > 0 ? JSON.stringify(sane) : null;
  }
  if (d.driveFolderUrl !== undefined)
    data.driveFolderUrl = d.driveFolderUrl || null;

  if (d.studentId !== undefined) {
    const r = await resolveStudentRef(d.studentId, session.user.id, role);
    if (!r.ok)
      return NextResponse.json(
        { error: "That student isn't visible to you." },
        { status: 400 },
      );
    data.studentId = r.id;
  }
  if (d.linkedTaskId !== undefined) {
    const r = await resolveTaskRef(d.linkedTaskId, session.user.id, role);
    if (!r.ok)
      return NextResponse.json(
        { error: "That task isn't visible to you." },
        { status: 400 },
      );
    data.linkedTaskId = r.id;
  }
  if (d.linkedEventId !== undefined) {
    const r = await resolveEventRef(d.linkedEventId, session.user.id, role);
    if (!r.ok)
      return NextResponse.json(
        { error: "That event isn't visible to you." },
        { status: 400 },
      );
    data.linkedEventId = r.id;
  }

  await prisma.involvement.update({ where: { id }, data });
  return NextResponse.json({ ok: true });
}

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await auth();
  if (!session?.user)
    return NextResponse.json({ error: "unauth" }, { status: 401 });
  const { id } = await params;
  const { item, owned } = await loadOwned(id, session.user.id);
  if (!item) return NextResponse.json({ error: "not found" }, { status: 404 });
  if (!owned)
    return NextResponse.json(
      { error: "You can only delete your own involvements." },
      { status: 403 },
    );

  await prisma.involvement.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}
