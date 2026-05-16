import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { isSupervisingUser, isTeamAdvisor, isAdmin, type Role } from "@/lib/access";

// Drives the violet bubble on the Team sidebar entry: new advisor
// suggestions (by someone else) since the viewer last opened /team.
export async function GET() {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ count: 0 });
  const role = session.user.role as Role;

  const audience =
    isTeamAdvisor(role) ||
    isAdmin(role) ||
    (await isSupervisingUser(session.user.id, role));
  if (!audience) return NextResponse.json({ count: 0 });

  const me = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { teamSuggestionsLastSeenAt: true },
  });
  const since = me?.teamSuggestionsLastSeenAt ?? new Date(0);

  const count = await prisma.advisorSuggestion.count({
    where: {
      authorId: { not: session.user.id },
      createdAt: { gt: since },
    },
  });
  return NextResponse.json({ count });
}
