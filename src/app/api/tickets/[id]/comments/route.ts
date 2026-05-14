import { NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { studentVisibilityWhereAllForAdmin, type Role } from "@/lib/access";

const Body = z.object({ body: z.string().min(1) });

async function authorize(id: string, userId: string, role: Role) {
  return prisma.ticket.findFirst({
    where: { id, student: studentVisibilityWhereAllForAdmin(userId, role) },
    select: { id: true },
  });
}

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "unauth" }, { status: 401 });
  const { id } = await params;
  const ok = await authorize(id, session.user.id, session.user.role as Role);
  if (!ok) return NextResponse.json({ error: "not found" }, { status: 404 });

  const comments = await prisma.comment.findMany({
    where: { ticketId: id },
    include: { author: { select: { name: true, image: true, color: true } } },
    orderBy: { createdAt: "asc" },
  });
  return NextResponse.json({
    comments: comments.map((c) => ({
      id: c.id,
      body: c.body,
      author: c.author,
      createdAt: c.createdAt.toISOString(),
    })),
  });
}

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "unauth" }, { status: 401 });
  const { id } = await params;
  const ok = await authorize(id, session.user.id, session.user.role as Role);
  if (!ok) return NextResponse.json({ error: "not found" }, { status: 404 });

  const json = await req.json().catch(() => null);
  const parsed = Body.safeParse(json);
  if (!parsed.success) return NextResponse.json({ error: "bad input" }, { status: 400 });

  const c = await prisma.comment.create({
    data: { ticketId: id, body: parsed.data.body, authorId: session.user.id },
    include: { author: { select: { name: true, image: true, color: true } } },
  });
  return NextResponse.json({
    comment: {
      id: c.id,
      body: c.body,
      author: c.author,
      createdAt: c.createdAt.toISOString(),
    },
  });
}
