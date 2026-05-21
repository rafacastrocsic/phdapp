import { prisma } from "@/lib/prisma";

/**
 * Bump `User.lastActiveAt` for an authenticated user, **throttled** so we
 * don't hammer the DB on every page render. The threshold below is the
 * smallest delta-from-current we'll write.
 *
 * Visibility is intentionally admin-only — see `/admin` for the surface.
 */
const THROTTLE_MS = 5 * 60_000; // 5 minutes

// Tiny per-process cache so back-to-back renders by the same user within
// the same Vercel function instance don't even hit the DB read.
const recentBumps = new Map<string, number>();

export async function bumpLastActive(userId: string): Promise<void> {
  const now = Date.now();
  const cached = recentBumps.get(userId);
  if (cached && now - cached < THROTTLE_MS) return;

  try {
    const me = await prisma.user.findUnique({
      where: { id: userId },
      select: { lastActiveAt: true },
    });
    const last = me?.lastActiveAt?.getTime() ?? 0;
    if (now - last < THROTTLE_MS) {
      recentBumps.set(userId, last);
      return;
    }
    await prisma.user.update({
      where: { id: userId },
      data: { lastActiveAt: new Date(now) },
    });
    recentBumps.set(userId, now);
  } catch {
    // Never let a metrics update break a page render.
  }
}
