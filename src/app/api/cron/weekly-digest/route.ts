import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

// Weekly supervisor digest. Wired to a Vercel Cron (see vercel.json).
// Requires RESEND_API_KEY and DIGEST_CRON_SECRET env vars on Vercel;
// no-ops gracefully if they're missing so the build/cron never breaks.
export async function GET(req: Request) {
  const secret = process.env.DIGEST_CRON_SECRET;
  if (secret) {
    const auth = req.headers.get("authorization");
    if (auth !== `Bearer ${secret}`)
      return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey)
    return NextResponse.json({ ok: true, skipped: "RESEND_API_KEY not set" });

  const { Resend } = await import("resend");
  const resend = new Resend(apiKey);
  const from = process.env.DIGEST_FROM || "PhDapp <onboarding@resend.dev>";
  const now = new Date();
  const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);

  const supervisors = await prisma.user.findMany({
    where: {
      role: { in: ["admin", "supervisor"] },
      emailDigest: true,
      email: { not: "" },
    },
    select: {
      id: true,
      name: true,
      email: true,
      supervisedStudents: { select: { id: true } },
      coSupervisedStudents: { select: { studentId: true, role: true } },
    },
  });

  let sent = 0;
  for (const u of supervisors) {
    const studentIds = Array.from(
      new Set([
        ...u.supervisedStudents.map((s) => s.id),
        ...u.coSupervisedStudents
          .filter((c) => c.role === "supervisor" || c.role === "co_supervisor")
          .map((c) => c.studentId),
      ]),
    );
    if (studentIds.length === 0) continue;

    const [overdue, pendingReading, lowWellbeing, recentCheckins] =
      await Promise.all([
        prisma.ticket.count({
          where: {
            studentId: { in: studentIds },
            status: { notIn: ["done"] },
            dueDate: { lt: now },
          },
        }),
        prisma.readingItem.count({
          where: { studentId: { in: studentIds }, status: "proposed" },
        }),
        prisma.checkIn.count({
          where: {
            studentId: { in: studentIds },
            weekOf: { gte: weekAgo },
            wellbeing: { lte: 2 },
          },
        }),
        prisma.checkIn.count({
          where: { studentId: { in: studentIds }, weekOf: { gte: weekAgo } },
        }),
      ]);

    if (
      overdue === 0 &&
      pendingReading === 0 &&
      lowWellbeing === 0 &&
      recentCheckins === 0
    )
      continue; // nothing worth emailing about

    const lines = [
      `<p>Hi ${u.name?.split(" ")[0] ?? "there"}, your PhDapp weekly summary:</p>`,
      "<ul>",
      overdue > 0 ? `<li><b>${overdue}</b> overdue task(s) across your students</li>` : "",
      pendingReading > 0
        ? `<li><b>${pendingReading}</b> reading proposal(s) waiting for your approval</li>`
        : "",
      lowWellbeing > 0
        ? `<li>⚠️ <b>${lowWellbeing}</b> student check-in(s) reported low wellbeing this week</li>`
        : "",
      recentCheckins > 0
        ? `<li><b>${recentCheckins}</b> new weekly check-in(s) submitted</li>`
        : "",
      "</ul>",
      `<p><a href="https://phdapp.vercel.app">Open PhDapp →</a></p>`,
    ].filter(Boolean);

    try {
      await resend.emails.send({
        from,
        to: u.email,
        subject: "PhDapp — your weekly supervision summary",
        html: lines.join("\n"),
      });
      sent++;
    } catch (err) {
      console.error("digest send failed for", u.email, err);
    }
  }
  return NextResponse.json({ ok: true, sent });
}
