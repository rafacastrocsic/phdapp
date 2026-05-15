import { NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { isSupervisingUser, isAdmin, type Role } from "@/lib/access";

const KEY = "teamDriveFolderUrl";
const Body = z.object({ url: z.string() });

export async function GET() {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "unauth" }, { status: 401 });
  if (!(await isSupervisingUser(session.user.id, session.user.role as Role)))
    return NextResponse.json({ error: "not found" }, { status: 404 });
  const row = await prisma.setting.findUnique({ where: { key: KEY } });
  return NextResponse.json({ url: row?.value ?? null });
}

// Only the admin sets the shared team Drive folder URL.
export async function PUT(req: Request) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "unauth" }, { status: 401 });
  if (!isAdmin(session.user.role))
    return NextResponse.json({ error: "Admin only" }, { status: 403 });
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success)
    return NextResponse.json({ error: "bad input" }, { status: 400 });
  const url = parsed.data.url.trim();
  await prisma.setting.upsert({
    where: { key: KEY },
    create: { key: KEY, value: url },
    update: { value: url },
  });
  return NextResponse.json({ url });
}
