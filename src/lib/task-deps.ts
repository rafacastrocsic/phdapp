import { prisma } from "./prisma";
import { logActivity } from "./activity-log";

/**
 * Task dependencies: a task with ≥1 incomplete "depends-on" parent is forced
 * to `blocked`; once every parent is `done` it auto-moves to `todo`.
 */

/** True if adding edge (dependent → dependsOn) would create a cycle. */
export async function wouldCreateCycle(
  dependentId: string,
  dependsOnId: string,
): Promise<boolean> {
  if (dependentId === dependsOnId) return true;
  // Cycle iff dependsOnId already (transitively) depends on dependentId.
  const seen = new Set<string>();
  const stack = [dependsOnId];
  let guard = 0;
  while (stack.length && guard++ < 10000) {
    const cur = stack.pop()!;
    if (cur === dependentId) return true;
    if (seen.has(cur)) continue;
    seen.add(cur);
    const edges = await prisma.taskDependency.findMany({
      where: { dependentId: cur },
      select: { dependsOnId: true },
    });
    for (const e of edges) stack.push(e.dependsOnId);
  }
  return false;
}

/**
 * Recompute one task's gate from its parents.
 * Returns the new status if it changed, else null.
 * - no dependencies → never auto-managed (returns null)
 * - already `done` → left alone
 * - any parent not done → forced `blocked`
 * - all parents done & currently `blocked` → moved to `todo`
 */
export async function applyDependencyGate(
  taskId: string,
): Promise<"blocked" | "todo" | null> {
  const task = await prisma.ticket.findUnique({
    where: { id: taskId },
    select: {
      status: true,
      dependsOn: { select: { dependsOn: { select: { status: true } } } },
    },
  });
  if (!task) return null;
  const parents = task.dependsOn.map((d) => d.dependsOn.status);
  if (parents.length === 0) return null;
  if (task.status === "done") return null;
  const anyIncomplete = parents.some((s) => s !== "done");
  if (anyIncomplete) {
    if (task.status !== "blocked") {
      await prisma.ticket.update({
        where: { id: taskId },
        data: { status: "blocked" },
      });
      return "blocked";
    }
    return null;
  }
  if (task.status === "blocked") {
    await prisma.ticket.update({
      where: { id: taskId },
      data: { status: "todo" },
    });
    return "todo";
  }
  return null;
}

/** After `taskId`'s status changed, re-gate its direct dependents + log. */
export async function propagateFrom(
  taskId: string,
  actorId: string,
  actorRole: string,
): Promise<void> {
  const deps = await prisma.taskDependency.findMany({
    where: { dependsOnId: taskId },
    select: { dependentId: true },
  });
  for (const d of deps) {
    const changed = await applyDependencyGate(d.dependentId);
    if (!changed) continue;
    const t = await prisma.ticket.findUnique({
      where: { id: d.dependentId },
      select: { title: true, studentId: true },
    });
    if (!t) continue;
    await logActivity({
      actorId,
      actorRole,
      studentId: t.studentId,
      action: "ticket.update",
      entityType: "ticket",
      entityId: d.dependentId,
      summary:
        changed === "todo"
          ? `task “${t.title}” unblocked (its dependencies are done) → To do`
          : `task “${t.title}” → Blocked (waiting on a dependency)`,
    }).catch(() => {});
  }
}

/**
 * Replace the set of parents for `dependentId`. Validates same-student and
 * rejects cycles. Returns an error string or null on success.
 */
export async function setDependencies(
  dependentId: string,
  studentId: string,
  dependsOnIds: string[],
): Promise<string | null> {
  const ids = [...new Set(dependsOnIds)].filter((x) => x && x !== dependentId);
  if (ids.length > 0) {
    const parents = await prisma.ticket.findMany({
      where: { id: { in: ids } },
      select: { id: true, studentId: true },
    });
    if (parents.length !== ids.length)
      return "Some selected tasks no longer exist.";
    if (parents.some((p) => p.studentId !== studentId))
      return "A task can only depend on the same student's tasks.";
    for (const pid of ids) {
      if (await wouldCreateCycle(dependentId, pid))
        return "That dependency would create a cycle.";
    }
  }
  await prisma.taskDependency.deleteMany({ where: { dependentId } });
  if (ids.length > 0)
    await prisma.taskDependency.createMany({
      data: ids.map((dependsOnId) => ({ dependentId, dependsOnId })),
    });
  return null;
}
