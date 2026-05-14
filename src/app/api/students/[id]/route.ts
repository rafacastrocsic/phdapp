import { NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import {
  accessForStudent,
  canDeleteStudent,
  canEditStudentProfile,
  studentVisibilityWhere,
  type Role,
} from "@/lib/access";
import { normalizeCalendarId } from "@/lib/calendar-id";
import { normalizeLinkedIn, normalizeOrcid, normalizeWebsite } from "@/lib/url-utils";
import { logActivity } from "@/lib/activity-log";

const Patch = z.object({
  fullName: z.string().min(1).optional(),
  alias: z.string().nullable().optional(),
  email: z.string().email().optional(),
  programYear: z.coerce.number().int().min(1).max(8).optional(),
  status: z.string().optional(),
  thesisTitle: z.string().nullable().optional(),
  researchArea: z.string().nullable().optional(),
  driveFolderId: z.string().nullable().optional(),
  calendarId: z.string().nullable().optional(),
  chatSpaceId: z.string().nullable().optional(),
  color: z.string().optional(),
  expectedEndDate: z.string().nullable().optional(),
  avatarUrl: z.string().nullable().optional(),
  linkedinUrl: z.string().nullable().optional(),
  orcidId: z.string().nullable().optional(),
  websiteUrl: z.string().nullable().optional(),
});

async function loadOwned(id: string, userId: string, role: Role) {
  // Admin can act on any student, even ones they don't personally supervise.
  const where = role === "admin" ? { id } : { id, ...studentVisibilityWhere(userId, role) };
  return prisma.student.findFirst({ where });
}

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "unauth" }, { status: 401 });

  const { id } = await params;
  const access = await accessForStudent(id, session.user.id, session.user.role as Role);
  if (!canEditStudentProfile(access))
    return NextResponse.json(
      { error: "You don't have permission to edit this student's profile" },
      { status: 403 },
    );
  const existing = await loadOwned(id, session.user.id, session.user.role as Role);
  if (!existing) return NextResponse.json({ error: "not found" }, { status: 404 });

  const json = await req.json().catch(() => null);
  const parsed = Patch.safeParse(json);
  if (!parsed.success)
    return NextResponse.json(
      { error: "Invalid payload", issues: parsed.error.issues },
      { status: 400 },
    );
  const d = parsed.data;

  const data: Record<string, unknown> = {};
  if (d.fullName !== undefined) data.fullName = d.fullName;
  if (d.alias !== undefined) data.alias = d.alias?.trim() || null;
  if (d.email !== undefined) data.email = d.email;
  if (d.programYear !== undefined) data.programYear = d.programYear;
  if (d.status !== undefined) data.status = d.status;
  if (d.thesisTitle !== undefined) data.thesisTitle = d.thesisTitle || null;
  if (d.researchArea !== undefined) data.researchArea = d.researchArea || null;
  // Drive folder + shared calendar are owned by the student's Google account.
  // Only the student themselves may change those fields; supervisors editing
  // someone else's profile cannot tamper with them, even via a crafted request.
  if (access === "self") {
    if (d.driveFolderId !== undefined) data.driveFolderId = d.driveFolderId || null;
    if (d.calendarId !== undefined) data.calendarId = normalizeCalendarId(d.calendarId);
  }
  if (d.chatSpaceId !== undefined) data.chatSpaceId = d.chatSpaceId || null;
  if (d.color !== undefined) data.color = d.color;
  if (d.expectedEndDate !== undefined)
    data.expectedEndDate = d.expectedEndDate ? new Date(d.expectedEndDate) : null;
  if (d.avatarUrl !== undefined) data.avatarUrl = d.avatarUrl || null;
  if (d.linkedinUrl !== undefined) data.linkedinUrl = normalizeLinkedIn(d.linkedinUrl);
  if (d.orcidId !== undefined) data.orcidId = normalizeOrcid(d.orcidId);
  if (d.websiteUrl !== undefined) data.websiteUrl = normalizeWebsite(d.websiteUrl);

  try {
    await prisma.student.update({ where: { id }, data });
  } catch (err) {
    const e = err as { code?: string; message?: string };
    if (e.code === "P2002")
      return NextResponse.json(
        { error: "Another student already has that email" },
        { status: 409 },
      );
    return NextResponse.json(
      { error: e.message ?? "Database update failed" },
      { status: 500 },
    );
  }

  await logActivity({
    actorId: session.user.id,
    actorRole: session.user.role,
    studentId: id,
    action: "student.update",
    entityType: "student",
    entityId: id,
    summary: `updated their profile (${Object.keys(data).join(", ")})`,
    details: data,
  });

  return NextResponse.json({ ok: true });
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "unauth" }, { status: 401 });
  const { id: idForDelete } = await params;
  const accessDel = await accessForStudent(idForDelete, session.user.id, session.user.role as Role);
  if (!canDeleteStudent(accessDel))
    return NextResponse.json(
      { error: "Only supervisors of this student can delete them" },
      { status: 403 },
    );

  const existing = await loadOwned(idForDelete, session.user.id, session.user.role as Role);
  if (!existing) return NextResponse.json({ error: "not found" }, { status: 404 });

  // Log first so we still have studentId reference; FK is SetNull on Student delete.
  await logActivity({
    actorId: session.user.id,
    actorRole: session.user.role,
    studentId: idForDelete,
    action: "student.delete",
    entityType: "student",
    entityId: idForDelete,
    summary: `deleted the student record (${existing.fullName})`,
  });
  await prisma.student.delete({ where: { id: idForDelete } });
  return NextResponse.json({ ok: true });
}
