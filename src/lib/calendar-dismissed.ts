import { prisma } from "./prisma";

export async function getDismissedEventIds(userId: string): Promise<string[]> {
  const u = await prisma.user.findUnique({
    where: { id: userId },
    select: { calendarDismissedEventIds: true },
  });
  if (!u?.calendarDismissedEventIds) return [];
  try {
    const arr = JSON.parse(u.calendarDismissedEventIds);
    return Array.isArray(arr) ? (arr as string[]) : [];
  } catch {
    return [];
  }
}

export async function addDismissedEventId(userId: string, eventId: string) {
  const current = await getDismissedEventIds(userId);
  if (current.includes(eventId)) return;
  await prisma.user.update({
    where: { id: userId },
    data: { calendarDismissedEventIds: JSON.stringify([...current, eventId]) },
  });
}

export async function clearDismissedEventIds(userId: string) {
  await prisma.user.update({
    where: { id: userId },
    data: { calendarDismissedEventIds: null },
  });
}
