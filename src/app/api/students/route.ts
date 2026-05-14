import { NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { colorFor } from "@/lib/utils";
import { normalizeCalendarId } from "@/lib/calendar-id";

const Body = z.object({
  fullName: z.string().min(1),
  alias: z.string().optional().nullable(),
  email: z.string().email(),
  programYear: z.coerce.number().int().min(1).max(8).default(1),
  status: z.string().default("active"),
  thesisTitle: z.string().optional().nullable(),
  researchArea: z.string().optional().nullable(),
  driveFolderId: z.string().optional().nullable(),
  calendarId: z.string().optional().nullable(),
  supervisorId: z.string().optional().nullable(), // admin-only: assign a different supervisor
});

export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "unauth" }, { status: 401 });
  if (session.user.role !== "supervisor" && session.user.role !== "admin")
    return NextResponse.json({ error: "Only supervisors can add students" }, { status: 403 });

  const json = await req.json().catch(() => null);
  const parsed = Body.safeParse(json);
  if (!parsed.success)
    return NextResponse.json(
      { error: "Invalid payload", issues: parsed.error.issues },
      { status: 400 },
    );

  const data = parsed.data;
  const existing = await prisma.student.findUnique({ where: { email: data.email } });
  if (existing)
    return NextResponse.json({ error: "A student with that email already exists" }, { status: 409 });

  // Admin can assign to a specific supervisor; otherwise the creator becomes the supervisor.
  const supervisorId =
    session.user.role === "admin" && data.supervisorId
      ? data.supervisorId
      : session.user.id;

  const student = await prisma.student.create({
    data: {
      fullName: data.fullName,
      alias: data.alias?.trim() || null,
      email: data.email,
      programYear: data.programYear,
      status: data.status,
      thesisTitle: data.thesisTitle || null,
      researchArea: data.researchArea || null,
      driveFolderId: data.driveFolderId || null,
      calendarId: normalizeCalendarId(data.calendarId),
      color: colorFor(data.email),
      supervisorId,
    },
  });

  // Create a default 1:1 channel between supervisor and (future) student
  await prisma.channel.create({
    data: {
      name: `1:1 · ${student.fullName}`,
      kind: "student",
      color: student.color,
      studentId: student.id,
      members: { create: [{ userId: session.user.id }] },
    },
  });

  return NextResponse.json({ student });
}
