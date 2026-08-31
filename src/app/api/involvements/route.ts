import { NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { type Role } from "@/lib/access";
import { isSeniorTeam } from "@/lib/discussions-access";
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

const Body = z.object({
  title: z.string().min(1).max(300),
  notes: z.string().max(20000).nullable().optional(),
  progress: z.number().int().min(0).max(100).optional(),
  checklist: ChecklistInput.optional(),
  status: z.enum(["active", "paused", "done"]).optional(),
  shared: z.boolean().optional(),
  allowComments: z.boolean().optional(),
  pinned: z.boolean().optional(),
  links: z.array(LinkInput).optional(),
  driveFolderUrl: z.string().nullable().optional(),
  studentId: z.string().nullable().optional(),
  linkedTaskId: z.string().nullable().optional(),
  linkedEventId: z.string().nullable().optional(),
});

// Create a "My Work" involvement. Senior team only; owned by the caller.
export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user)
    return NextResponse.json({ error: "unauth" }, { status: 401 });
  const role = session.user.role as Role;
  if (!(await isSeniorTeam(session.user.id, role)))
    return NextResponse.json(
      { error: "My Work is for the supervising team." },
      { status: 403 },
    );

  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success)
    return NextResponse.json({ error: "bad input" }, { status: 400 });
  const d = parsed.data;

  const [stu, task, event] = await Promise.all([
    resolveStudentRef(d.studentId, session.user.id, role),
    resolveTaskRef(d.linkedTaskId, session.user.id, role),
    resolveEventRef(d.linkedEventId, session.user.id, role),
  ]);
  if (!stu.ok || !task.ok || !event.ok)
    return NextResponse.json(
      { error: "A linked item isn't visible to you." },
      { status: 400 },
    );

  const sane = d.links ? sanitiseLinks(d.links) : [];
  // A checklist, when present, drives the progress %; otherwise the manual
  // value is used.
  const checklist = d.checklist ? sanitiseChecklist(d.checklist) : [];
  const progress = checklist.length
    ? checklistProgress(checklist)!
    : d.progress ?? 0;
  const item = await prisma.involvement.create({
    data: {
      ownerId: session.user.id,
      title: d.title.trim(),
      notes: d.notes?.trim() || null,
      progress,
      checklist: checklist.length > 0 ? JSON.stringify(checklist) : null,
      status: d.status ?? "active",
      shared: d.shared ?? false,
      allowComments: d.allowComments ?? false,
      pinned: d.pinned ?? false,
      links: sane.length > 0 ? JSON.stringify(sane) : null,
      driveFolderUrl: d.driveFolderUrl || null,
      studentId: stu.id,
      linkedTaskId: task.id,
      linkedEventId: event.id,
    },
    select: { id: true },
  });

  return NextResponse.json({ id: item.id });
}
