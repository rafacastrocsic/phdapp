-- Allow tasks to live without a student ("team-only" tasks).
-- Existing rows all have a studentId set, so dropping NOT NULL is safe.
-- Visibility is enforced by application code: students never see a task
-- with studentId IS NULL (their queries already filter by studentId
-- IN (visibleStudents), which excludes NULL).

ALTER TABLE "Ticket" ALTER COLUMN "studentId" DROP NOT NULL;
