-- "News" window: per-user last-seen + personal opt-out, plus admin-authored
-- announcements. The global on/off toggle lives in the Setting table
-- (key = 'newsEnabled'), no schema change needed for that.
ALTER TABLE "User" ADD COLUMN "newsLastSeenAt" TIMESTAMP(3);
ALTER TABLE "User" ADD COLUMN "newsEnabled" BOOLEAN NOT NULL DEFAULT true;

CREATE TABLE "NewsPost" (
  "id" TEXT NOT NULL,
  "title" TEXT NOT NULL,
  "body" TEXT NOT NULL,
  "authorId" TEXT,
  "publishedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "NewsPost_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "NewsPost_publishedAt_idx" ON "NewsPost"("publishedAt");

ALTER TABLE "NewsPost" ADD CONSTRAINT "NewsPost_authorId_fkey"
  FOREIGN KEY ("authorId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
