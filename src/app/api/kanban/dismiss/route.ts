import { NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/auth";
import { addDismissedTicketId } from "@/lib/kanban-dismissed";

const Body = z.object({ ticketId: z.string().min(1) });

export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "unauth" }, { status: 401 });
  const json = await req.json().catch(() => null);
  const parsed = Body.safeParse(json);
  if (!parsed.success) return NextResponse.json({ error: "bad input" }, { status: 400 });
  await addDismissedTicketId(session.user.id, parsed.data.ticketId);
  return NextResponse.json({ ok: true });
}
