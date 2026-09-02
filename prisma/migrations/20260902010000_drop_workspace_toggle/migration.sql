-- The Project Researcher workspace is now provisioned by an admin/supervisor
-- and shared automatically with each assigned student's circle, so the
-- per-user "share with my students" toggle is no longer needed.
ALTER TABLE "User" DROP COLUMN IF EXISTS "workspaceShareStudents";
