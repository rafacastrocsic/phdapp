import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { format } from "date-fns";

export async function GET() {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "unauth" }, { status: 401 });
  if (session.user.role !== "admin")
    return NextResponse.json({ error: "Admin only" }, { status: 403 });

  const logs = await prisma.activityLog.findMany({
    include: {
      actor: { select: { name: true, email: true, role: true } },
      student: { select: { fullName: true, alias: true } },
    },
    orderBy: { createdAt: "desc" },
  });

  const lines: string[] = [];
  lines.push("# PhDapp — Log Book Export");
  lines.push("");
  lines.push(`Exported on ${format(new Date(), "yyyy-MM-dd HH:mm")} (${logs.length} entries)`);
  lines.push("");

  let lastDay = "";
  for (const l of logs) {
    const day = format(l.createdAt, "yyyy-MM-dd (EEEE)");
    if (day !== lastDay) {
      lines.push("");
      lines.push(`## ${day}`);
      lines.push("");
      lastDay = day;
    }
    const t = format(l.createdAt, "HH:mm:ss");
    const actor = l.actor?.name ?? l.actor?.email ?? "(unknown)";
    const role = l.actorRoleAtTime || l.actor?.role || "?";
    const student = l.student
      ? ` · about **${l.student.alias?.trim() || l.student.fullName}**`
      : "";
    const entity =
      l.entityType && l.entityId ? ` (${l.entityType}#${l.entityId})` : "";
    lines.push(
      `- \`${t}\` **${actor}** _(${role})_ — ${l.summary}${student}${entity}`,
    );
    if (l.details) {
      try {
        const parsed = JSON.parse(l.details);
        const keys = Object.keys(parsed);
        if (keys.length > 0) {
          lines.push(`  - changed: ${keys.join(", ")}`);
        }
      } catch {
        // ignore parse failures
      }
    }
  }
  if (logs.length === 0) {
    lines.push("");
    lines.push("_(no entries)_");
  }

  return new NextResponse(lines.join("\n"), {
    status: 200,
    headers: {
      "Content-Type": "text/markdown; charset=utf-8",
      "Content-Disposition": `attachment; filename="phdapp-log-${format(new Date(), "yyyy-MM-dd")}.md"`,
    },
  });
}
