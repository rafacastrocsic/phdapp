import { prisma } from "./prisma";
import {
  isAdmin,
  isSupervisingUser,
  isTeamAdvisorAnywhere,
  type Role,
} from "./access";

// ───────── Discussions visibility ─────────
//
// Two audiences, mirroring the Topic.visibility field:
//   "supervisors" → the SENIOR TEAM only (admins + real supervisors +
//                   team advisors). External advisors / committee members
//                   and students are excluded. Same group used by the
//                   Advisor-suggestions unread check.
//   "team"        → everyone authenticated (students included).
//
// A tagged studentId is metadata only — it never widens or narrows who can
// read the topic; visibility alone governs that.

/**
 * True if the user is part of the senior team: an admin, a supervisor with
 * at least one student, or a team advisor of some student. This is the group
 * that can create topics and read "supervisors"-visibility ones.
 */
export async function isSeniorTeam(userId: string, role: Role): Promise<boolean> {
  return (
    isAdmin(role) ||
    (await isSupervisingUser(userId, role)) ||
    (await isTeamAdvisorAnywhere(userId))
  );
}

/** Prisma `where` fragment limiting a Topic query to what this user may read. */
export function topicVisibilityWhere(senior: boolean) {
  return senior ? {} : { visibility: "team" };
}

/** Can a user who is/ isn't senior read a topic of the given visibility? */
export function canSeeVisibility(visibility: string, senior: boolean): boolean {
  return visibility === "team" || senior;
}

/**
 * Distinct user ids to notify when a comment lands on a topic: the topic
 * author plus everyone who has already commented. The caller passes the
 * actor's id to notify(), which drops it, so we don't filter it here.
 */
export async function topicParticipantIds(
  topicId: string,
  topicAuthorId: string,
): Promise<string[]> {
  const commenters = await prisma.comment.findMany({
    where: { topicId },
    select: { authorId: true },
    distinct: ["authorId"],
  });
  return Array.from(new Set([topicAuthorId, ...commenters.map((c) => c.authorId)]));
}
