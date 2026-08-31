import { prisma } from "./prisma";
import { studentVisibilityWhereAllForAdmin, type Role } from "./access";

// Validate the optional student / task / event a "My Work" involvement points
// at: the user may only reference things they can actually see. Each returns
// `{ ok }`; `ok:false` means an id was supplied that isn't visible → the
// route should 400 rather than silently attach it.

export async function resolveStudentRef(
  id: string | null | undefined,
  userId: string,
  role: Role,
): Promise<{ ok: boolean; id: string | null }> {
  if (!id) return { ok: true, id: null };
  const s = await prisma.student.findFirst({
    where: { id, ...studentVisibilityWhereAllForAdmin(userId, role) },
    select: { id: true },
  });
  return s ? { ok: true, id: s.id } : { ok: false, id: null };
}

export async function resolveTaskRef(
  id: string | null | undefined,
  userId: string,
  role: Role,
): Promise<{ ok: boolean; id: string | null }> {
  if (!id) return { ok: true, id: null };
  const t = await prisma.ticket.findFirst({
    where: {
      id,
      archivedAt: null,
      student: studentVisibilityWhereAllForAdmin(userId, role),
    },
    select: { id: true },
  });
  return t ? { ok: true, id: t.id } : { ok: false, id: null };
}

export async function resolveEventRef(
  id: string | null | undefined,
  userId: string,
  role: Role,
): Promise<{ ok: boolean; id: string | null }> {
  if (!id) return { ok: true, id: null };
  const visible = await prisma.student.findMany({
    where: studentVisibilityWhereAllForAdmin(userId, role),
    select: { id: true },
  });
  const ids = visible.map((s) => s.id);
  const e = await prisma.event.findFirst({
    where: {
      id,
      OR: [
        { studentId: { in: ids } },
        { studentId: null, isGeneral: true },
        { ownerId: userId },
      ],
    },
    select: { id: true },
  });
  return e ? { ok: true, id: e.id } : { ok: false, id: null };
}
