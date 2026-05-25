-- Threaded discussion on Reading items, mirroring the same Comment
-- table already used by Tasks and Calendar events. Adds a nullable
-- readingItemId column + a foreign key (cascade on delete so deleting
-- a reading item removes its comments) + an index for the typical
-- "fetch comments for this reading item" query.

ALTER TABLE "Comment" ADD COLUMN "readingItemId" TEXT;

CREATE INDEX "Comment_readingItemId_idx" ON "Comment"("readingItemId");

ALTER TABLE "Comment"
  ADD CONSTRAINT "Comment_readingItemId_fkey"
  FOREIGN KEY ("readingItemId") REFERENCES "ReadingItem"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;
