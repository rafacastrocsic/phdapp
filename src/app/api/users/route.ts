import { NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { colorFor } from "@/lib/utils";

/**
 * Admin-only: create a new User row directly, without requiring Google sign-in.
 * Useful for adding external advisors and committee members who may never log in.
 *
 * If `studentId` is provided, the new user is also attached to that student as
 * a co-supervisor with `teamRole` (supervisor | external_advisor | committee).
 *
 * If a user with the same email already exists, we re-use them (and just
 * create the team link).
 */
const Body = z.object({
  name: z.string().min(1),
  email: z.string().email(),
  color: z.string().optional(),
  studentId: z.string().optional(),
  teamRole: z
    .enum(["supervisor", "external_advisor", "committee"])
    .default("supervisor"),
});

export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "unauth" }, { status: 401 });
  if (session.user.role !== "admin")
    return NextResponse.json({ error: "Admin only" }, { status: 403 });

  const json = await req.json().catch(() => null);
  const parsed = Body.safeParse(json);
  if (!parsed.success)
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "bad input" },
      { status: 400 },
    );
  const d = parsed.data;

  const email = d.email.toLowerCase();
  let user = await prisma.user.findUnique({ where: { email } });
  let userCreated = false;
  if (!user) {
    user = await prisma.user.create({
      data: {
        name: d.name,
        email,
        role: "supervisor", // even external advisors / committee get "supervisor" globally so they can sign in if they want
        color: d.color || colorFor(email),
      },
    });
    userCreated = true;
  } else if (user.role === "student") {
    // Promote them so they can write across the supervision team.
    user = await prisma.user.update({
      where: { id: user.id },
      data: { role: "supervisor" },
    });
  }

  let linkedStudentId: string | null = null;
  if (d.studentId) {
    const student = await prisma.student.findUnique({
      where: { id: d.studentId },
      select: { id: true, supervisorId: true },
    });
    if (!student)
      return NextResponse.json(
        { error: "Student not found", user },
        { status: 404 },
      );
    if (student.supervisorId === user.id) {
      // already the primary supervisor; nothing more to do
    } else {
      try {
        await prisma.coSupervisor.create({
          data: {
            studentId: d.studentId,
            userId: user.id,
            role: d.teamRole,
          },
        });
        linkedStudentId = d.studentId;
      } catch (err) {
        const e = err as { code?: string };
        if (e.code !== "P2002") throw err;
        // already on the team — fine
        linkedStudentId = d.studentId;
      }
    }
  }

  return NextResponse.json({ user, userCreated, linkedStudentId });
}
