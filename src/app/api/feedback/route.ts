import { NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { isAdmin, type Role } from "@/lib/access";
import { notify } from "@/lib/notify";

const KINDS = ["bug", "idea", "other"] as const;
const STATUSES = ["open", "planned", "in_progress", "done", "declined"];

const Body = z.object({
  kind: z.enum(KINDS),
  subject: z.string().trim().min(1).max(160),
  body: z.string().trim().min(1).max(5000),
  imageUrl: z.string().url().nullable().optional(),
});

// Any authenticated user can send the admins feedback.
export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user)
    return NextResponse.json({ error: "unauth" }, { status: 401 });

  const json = await req.json().catch(() => null);
  const parsed = Body.safeParse(json);
  if (!parsed.success)
    return NextResponse.json({ error: "bad input" }, { status: 400 });
  const d = parsed.data;

  const created = await prisma.feedback.create({
    data: {
      authorId: session.user.id,
      kind: d.kind,
      subject: d.subject,
      body: d.body,
      imageUrl: d.imageUrl || null,
    },
  });

  // Ping every admin (in-app notification row + best-effort email).
  const admins = await prisma.user.findMany({
    where: { role: "admin" },
    select: { id: true },
  });
  await notify(
    admins.map((a) => a.id),
    {
      type: "feedback.new",
      message: `New ${d.kind === "bug" ? "bug report" : d.kind === "idea" ? "suggestion" : "feedback"}: “${d.subject}”`,
      link: "/feedback",
      actorId: session.user.id,
    },
  ).catch(() => {});

  return NextResponse.json({ id: created.id });
}

// Admins see everything (optionally filtered); everyone else sees only
// their own submissions.
export async function GET(req: Request) {
  const session = await auth();
  if (!session?.user)
    return NextResponse.json({ error: "unauth" }, { status: 401 });
  const role = session.user.role as Role;
  const admin = isAdmin(role);

  const url = new URL(req.url);
  const statusFilter = url.searchParams.get("status");
  const kindFilter = url.searchParams.get("kind");

  const items = await prisma.feedback.findMany({
    where: {
      ...(admin ? {} : { authorId: session.user.id }),
      ...(statusFilter && STATUSES.includes(statusFilter)
        ? { status: statusFilter }
        : {}),
      ...(kindFilter && (KINDS as readonly string[]).includes(kindFilter)
        ? { kind: kindFilter }
        : {}),
    },
    include: {
      author: { select: { id: true, name: true, image: true, color: true } },
      repliedBy: { select: { id: true, name: true } },
      messages: {
        orderBy: { createdAt: "asc" },
        include: {
          author: { select: { id: true, name: true, image: true, color: true } },
        },
      },
    },
    orderBy: [{ updatedAt: "desc" }],
  });

  return NextResponse.json({
    isAdmin: admin,
    items: items.map((f) => ({
      id: f.id,
      kind: f.kind,
      subject: f.subject,
      body: f.body,
      status: f.status,
      imageUrl: f.imageUrl,
      adminReply: f.adminReply,
      repliedBy: f.repliedBy,
      repliedAt: f.repliedAt?.toISOString() ?? null,
      createdAt: f.createdAt.toISOString(),
      updatedAt: f.updatedAt.toISOString(),
      // Author identity is only exposed to admins.
      author: admin ? f.author : null,
      mine: f.authorId === session.user.id,
      messages: f.messages.map((m) => ({
        id: m.id,
        body: m.body,
        createdAt: m.createdAt.toISOString(),
        editedAt: m.editedAt?.toISOString() ?? null,
        // Author identity: admins see everyone, submitters see admins
        // (so they can see "from an admin"); both always see their own.
        author: m.author,
        mine: m.authorId === session.user.id,
      })),
    })),
  });
}
