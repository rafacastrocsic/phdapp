-- Calls & deadlines: a dated window with a hard close (funding call that opens
-- and closes, report due date, internal milestone). Visible to everyone;
-- only the senior team may create/edit. opensAt is nullable so a plain due
-- date (no window) is representable.
CREATE TABLE "Deadline" (
  "id" TEXT NOT NULL,
  "title" TEXT NOT NULL,
  "kind" TEXT NOT NULL DEFAULT 'call',
  "opensAt" TIMESTAMP(3),
  "closesAt" TIMESTAMP(3) NOT NULL,
  "url" TEXT,
  "notes" TEXT,
  "driveFolderUrl" TEXT,
  "studentId" TEXT,
  "createdById" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "Deadline_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "Deadline_closesAt_idx" ON "Deadline"("closesAt");
CREATE INDEX "Deadline_studentId_idx" ON "Deadline"("studentId");

ALTER TABLE "Deadline" ADD CONSTRAINT "Deadline_studentId_fkey"
  FOREIGN KEY ("studentId") REFERENCES "Student"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Deadline" ADD CONSTRAINT "Deadline_createdById_fkey"
  FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
