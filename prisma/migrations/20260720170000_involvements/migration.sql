-- "My Work": each senior-team member's personal portfolio of involvements
-- (private by default; `shared` exposes an item read-only to the senior
-- team). Composes a Links list, an optional Drive folder, and optional
-- live references to a student / task / event.

CREATE TABLE "Involvement" (
    "id" TEXT NOT NULL,
    "ownerId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "notes" TEXT,
    "progress" INTEGER NOT NULL DEFAULT 0,
    "status" TEXT NOT NULL DEFAULT 'active',
    "shared" BOOLEAN NOT NULL DEFAULT false,
    "pinned" BOOLEAN NOT NULL DEFAULT false,
    "order" INTEGER NOT NULL DEFAULT 0,
    "links" TEXT,
    "driveFolderUrl" TEXT,
    "studentId" TEXT,
    "linkedTaskId" TEXT,
    "linkedEventId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "Involvement_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "Involvement_ownerId_idx" ON "Involvement"("ownerId");
CREATE INDEX "Involvement_shared_idx" ON "Involvement"("shared");

ALTER TABLE "Involvement" ADD CONSTRAINT "Involvement_ownerId_fkey"
  FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Involvement" ADD CONSTRAINT "Involvement_studentId_fkey"
  FOREIGN KEY ("studentId") REFERENCES "Student"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Involvement" ADD CONSTRAINT "Involvement_linkedTaskId_fkey"
  FOREIGN KEY ("linkedTaskId") REFERENCES "Ticket"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Involvement" ADD CONSTRAINT "Involvement_linkedEventId_fkey"
  FOREIGN KEY ("linkedEventId") REFERENCES "Event"("id") ON DELETE SET NULL ON UPDATE CASCADE;
