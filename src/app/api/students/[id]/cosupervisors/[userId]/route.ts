import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";

export async function DELETE(
  req: Request,
  { params }: { params: Promise<{ id: string; userId: string }> },
) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "unauth" }, { status: 401 });
  if (session.user.role !== "admin" && session.user.role !== "supervisor")
    return NextResponse.json(
      { error: "Only supervisors can manage the team" },
      { status: 403 },
    );

  const { id, userId } = await params;

  const student = await prisma.student.findFirst({
    where:
      session.user.role === "admin"
        ? { id }
        : {
            id,
            OR: [
              { supervisorId: session.user.id },
              { coSupervisors: { some: { userId: session.user.id } } },
            ],
          },
    select: { id: true, supervisorId: true },
  });
  if (!student) return NextResponse.json({ error: "not found" }, { status: 404 });

  // Removing the PRIMARY supervisor: auto-promote a successor or fail with a clear message.
  if (userId === student.supervisorId) {
    // Pick from the additional supervisors, preferring those whose CoSupervisor.role is "supervisor".
    const successor =
      (await prisma.coSupervisor.findFirst({
        where: { studentId: id, role: "supervisor" },
        orderBy: { id: "asc" },
      })) ??
      (await prisma.coSupervisor.findFirst({
        where: { studentId: id },
        orderBy: { id: "asc" },
      }));

    // Allow forced override: ?successor=<userId>
    const url = new URL(req.url);
    const forcedSuccessor = url.searchParams.get("successor");
    const chosenSuccessorUserId = forcedSuccessor ?? successor?.userId;

    if (!chosenSuccessorUserId) {
      return NextResponse.json(
        {
          error:
            "Can't remove the primary supervisor: there is no other team member to promote. Add another supervisor first, then remove this one.",
        },
        { status: 409 },
      );
    }

    // Transactionally: make successor primary, remove their CoSupervisor row, and remove the old primary.
    await prisma.$transaction([
      prisma.student.update({
        where: { id },
        data: { supervisorId: chosenSuccessorUserId },
      }),
      prisma.coSupervisor.deleteMany({
        where: { studentId: id, userId: chosenSuccessorUserId },
      }),
      // The old primary may or may not have a CoSupervisor row — clean it up regardless.
      prisma.coSupervisor.deleteMany({
        where: { studentId: id, userId },
      }),
    ]);
    return NextResponse.json({ ok: true, promotedUserId: chosenSuccessorUserId });
  }

  // Removing an additional supervisor — straightforward delete.
  await prisma.coSupervisor.deleteMany({
    where: { studentId: id, userId },
  });
  return NextResponse.json({ ok: true });
}

/**
 * PATCH: promote an existing additional supervisor to PRIMARY.
 * Old primary becomes an additional supervisor with role="supervisor".
 */
export async function PATCH(
  _req: Request,
  { params }: { params: Promise<{ id: string; userId: string }> },
) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "unauth" }, { status: 401 });
  if (session.user.role !== "admin" && session.user.role !== "supervisor")
    return NextResponse.json(
      { error: "Only supervisors can manage the team" },
      { status: 403 },
    );

  const { id, userId } = await params;

  const student = await prisma.student.findFirst({
    where:
      session.user.role === "admin"
        ? { id }
        : {
            id,
            OR: [
              { supervisorId: session.user.id },
              { coSupervisors: { some: { userId: session.user.id } } },
            ],
          },
    select: { id: true, supervisorId: true },
  });
  if (!student) return NextResponse.json({ error: "not found" }, { status: 404 });

  if (student.supervisorId === userId) {
    return NextResponse.json({ ok: true, message: "Already the primary supervisor." });
  }

  // Make sure the target is currently on the team
  const target = await prisma.coSupervisor.findFirst({
    where: { studentId: id, userId },
  });
  if (!target)
    return NextResponse.json(
      { error: "That user is not on this student's team." },
      { status: 404 },
    );

  const oldPrimaryId = student.supervisorId;

  await prisma.$transaction([
    prisma.student.update({
      where: { id },
      data: { supervisorId: userId },
    }),
    // Remove the new primary's CoSupervisor row
    prisma.coSupervisor.delete({ where: { id: target.id } }),
    // Add the old primary as an additional supervisor (role=supervisor)
    prisma.coSupervisor.create({
      data: {
        studentId: id,
        userId: oldPrimaryId,
        role: "supervisor",
      },
    }),
  ]);
  return NextResponse.json({ ok: true });
}
