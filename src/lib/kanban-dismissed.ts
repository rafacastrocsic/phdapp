import { prisma } from "./prisma";

export async function getDismissedTicketIds(userId: string): Promise<string[]> {
  const u = await prisma.user.findUnique({
    where: { id: userId },
    select: { kanbanDismissedTicketIds: true },
  });
  if (!u?.kanbanDismissedTicketIds) return [];
  try {
    const arr = JSON.parse(u.kanbanDismissedTicketIds);
    return Array.isArray(arr) ? (arr as string[]) : [];
  } catch {
    return [];
  }
}

export async function addDismissedTicketId(userId: string, ticketId: string) {
  const current = await getDismissedTicketIds(userId);
  if (current.includes(ticketId)) return;
  await prisma.user.update({
    where: { id: userId },
    data: { kanbanDismissedTicketIds: JSON.stringify([...current, ticketId]) },
  });
}

export async function clearDismissedTicketIds(userId: string) {
  await prisma.user.update({
    where: { id: userId },
    data: { kanbanDismissedTicketIds: null },
  });
}
