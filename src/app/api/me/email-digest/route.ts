import { NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";

const Body = z.object({ emailDigest: z.boolean() });

export async function PATCH(req: Request) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "unauth" }, { status: 401 });
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success)
    return NextResponse.json({ error: "bad input" }, { status: 400 });
  await prisma.user.update({
    where: { id: session.user.id },
    data: { emailDigest: parsed.data.emailDigest },
  });
  return NextResponse.json({ ok: true });
}
