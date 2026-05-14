import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { calendarForUser } from "@/lib/google";

/**
 * Lists the Google Calendars the signed-in user can write to.
 * Used by the calendar-picker dialog.
 */
export async function GET() {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "unauth" }, { status: 401 });

  const cal = await calendarForUser(session.user.id);
  if (!cal)
    return NextResponse.json({ error: "Google account not linked." }, { status: 400 });

  try {
    const r = await cal.calendarList.list({ minAccessRole: "writer", showHidden: false });
    const calendars = (r.data.items ?? []).map((c) => ({
      id: c.id ?? "",
      summary: c.summary ?? "",
      summaryOverride: c.summaryOverride ?? null,
      backgroundColor: c.backgroundColor ?? "#6366f1",
      foregroundColor: c.foregroundColor ?? "#ffffff",
      primary: !!c.primary,
      accessRole: c.accessRole ?? "reader",
    }));
    return NextResponse.json({ calendars });
  } catch (err) {
    return NextResponse.json(
      { error: (err as Error).message ?? "Calendar list failed" },
      { status: 500 },
    );
  }
}
