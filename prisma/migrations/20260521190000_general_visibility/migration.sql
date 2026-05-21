-- Three-state visibility for tasks and events:
--   studentId set                    → student-specific
--   studentId null, isGeneral false  → team-only (non-students only)
--   studentId null, isGeneral true   → general (visible to everyone)
-- New flag is additive; existing rows default to false → unchanged behaviour.

ALTER TABLE "Ticket" ADD COLUMN "isGeneral" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Event"  ADD COLUMN "isGeneral" BOOLEAN NOT NULL DEFAULT false;

-- Informational alternate emails on User (JSON array of strings).
-- Shown next to LinkedIn / ORCID on the profile; not used for login or
-- notifications.
ALTER TABLE "User" ADD COLUMN "alternateEmails" TEXT;
