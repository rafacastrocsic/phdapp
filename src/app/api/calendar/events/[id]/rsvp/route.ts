import { NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";

// An invitee sets their own RSVP status on an event. Only works if the
// caller is actually on the guest list (has an EventAttendee row).
const Body = z.object({
  status: z.enum(["accepted", "declined", "tentative", "invited"]),
});

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await auth();
  if (!session?.user)
    return NextResponse.json({ error: "unauth" }, { status: 401 });
  const { id } = await params;

  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success)
    return NextResponse.json({ error: "bad input" }, { status: 400 });

  const row = await prisma.eventAttendee.findUnique({
    where: { eventId_userId: { eventId: id, userId: session.user.id } },
    select: { id: true },
  });
  if (!row)
    return NextResponse.json(
      { error: "You're not on this event's guest list." },
      { status: 403 },
    );

  await prisma.eventAttendee.update({
    where: { id: row.id },
    data: { status: parsed.data.status },
  });
  return NextResponse.json({ ok: true, status: parsed.data.status });
}
