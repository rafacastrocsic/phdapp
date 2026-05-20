-- Comments are now polymorphic (Ticket OR Event) and support 1-level
-- nesting via parentId. Existing rows keep their ticketId; no backfill
-- needed.

-- 1. Allow Comment.ticketId to be NULL (so a Comment can attach to an
--    Event instead). The CHECK below ensures exactly one parent target.
ALTER TABLE "Comment" ALTER COLUMN "ticketId" DROP NOT NULL;

-- 2. New columns.
ALTER TABLE "Comment" ADD COLUMN "eventId"  TEXT;
ALTER TABLE "Comment" ADD COLUMN "parentId" TEXT;

-- 3. FKs.
ALTER TABLE "Comment" ADD CONSTRAINT "Comment_eventId_fkey"
  FOREIGN KEY ("eventId")  REFERENCES "Event"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Comment" ADD CONSTRAINT "Comment_parentId_fkey"
  FOREIGN KEY ("parentId") REFERENCES "Comment"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

-- 4. Indices for thread lookups.
CREATE INDEX "Comment_ticketId_idx" ON "Comment"("ticketId");
CREATE INDEX "Comment_eventId_idx"  ON "Comment"("eventId");
CREATE INDEX "Comment_parentId_idx" ON "Comment"("parentId");

-- 5. Exactly one of ticketId/eventId must be set (XOR).
ALTER TABLE "Comment" ADD CONSTRAINT "Comment_target_xor_check"
  CHECK (
    ("ticketId" IS NOT NULL AND "eventId" IS NULL) OR
    ("ticketId" IS NULL     AND "eventId" IS NOT NULL)
  );
