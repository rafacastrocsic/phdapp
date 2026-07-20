-- Discussions: persistent, topic-first threads for the team (brainstorms,
-- open questions, decisions). A Topic has a title + opening post, an
-- optional student tag, a Links list, an optional Drive folder, and a
-- threaded comment section reusing the existing Comment table.

-- 1. "last seen" pointer for the sidebar unread badge.
ALTER TABLE "User" ADD COLUMN "discussionsLastSeenAt" TIMESTAMP(3);

-- 2. Topic table.
CREATE TABLE "Topic" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "body" TEXT,
    "authorId" TEXT NOT NULL,
    "visibility" TEXT NOT NULL DEFAULT 'supervisors',
    "studentId" TEXT,
    "links" TEXT,
    "driveFolderUrl" TEXT,
    "pinned" BOOLEAN NOT NULL DEFAULT false,
    "closedAt" TIMESTAMP(3),
    "lastActivityAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "Topic_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "Topic_visibility_lastActivityAt_idx" ON "Topic"("visibility", "lastActivityAt");
CREATE INDEX "Topic_studentId_idx" ON "Topic"("studentId");

ALTER TABLE "Topic"
  ADD CONSTRAINT "Topic_authorId_fkey"
  FOREIGN KEY ("authorId") REFERENCES "User"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "Topic"
  ADD CONSTRAINT "Topic_studentId_fkey"
  FOREIGN KEY ("studentId") REFERENCES "Student"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

-- 3. Comments can hang off a Topic (mirrors ticketId / eventId / readingItemId).
ALTER TABLE "Comment" ADD COLUMN "topicId" TEXT;

CREATE INDEX "Comment_topicId_idx" ON "Comment"("topicId");

ALTER TABLE "Comment"
  ADD CONSTRAINT "Comment_topicId_fkey"
  FOREIGN KEY ("topicId") REFERENCES "Topic"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;
