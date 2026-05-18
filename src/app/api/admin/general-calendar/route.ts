import { NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { isAdmin } from "@/lib/access";
import { normalizeCalendarId } from "@/lib/calendar-id";
import { GENERAL_CALENDAR_KEY } from "@/lib/general-calendar";

const Body = z.object({ value: z.string() });

// Admin-only: the Google Calendar used for unassigned events and for
// tasks whose student has no shared calendar.
export async function GET() {
  const session = await auth();
  if (!session?.user)
    return NextResponse.json({ error: "unauth" }, { status: 401 });
  if (!isAdmin(session.user.role))
    return NextResponse.json({ error: "Admin only" }, { status: 403 });
  const row = await prisma.setting.findUnique({
    where: { key: GENERAL_CALENDAR_KEY },
  });
  const raw = row?.value ?? "";
  return NextResponse.json({
    value: raw,
    normalized: normalizeCalendarId(raw),
  });
}

export async function PUT(req: Request) {
  const session = await auth();
  if (!session?.user)
    return NextResponse.json({ error: "unauth" }, { status: 401 });
  if (!isAdmin(session.user.role))
    return NextResponse.json({ error: "Admin only" }, { status: 403 });
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success)
    return NextResponse.json({ error: "bad input" }, { status: 400 });
  const value = parsed.data.value.trim();
  const normalized = normalizeCalendarId(value);
  if (value && !normalized)
    return NextResponse.json(
      { error: "Could not read a calendar ID from that value." },
      { status: 400 },
    );
  await prisma.setting.upsert({
    where: { key: GENERAL_CALENDAR_KEY },
    create: { key: GENERAL_CALENDAR_KEY, value },
    update: { value },
  });
  return NextResponse.json({ value, normalized });
}
