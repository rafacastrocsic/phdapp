-- Comments on My Work involvements: reuse the polymorphic Comment table.
-- Add a per-item toggle so the owner controls whether other senior members
-- may comment, add Comment.involvementId, and widen the target CHECK to
-- "exactly one of the five target columns".

ALTER TABLE "Involvement" ADD COLUMN "allowComments" BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE "Comment" ADD COLUMN "involvementId" TEXT;
CREATE INDEX "Comment_involvementId_idx" ON "Comment"("involvementId");
ALTER TABLE "Comment" ADD CONSTRAINT "Comment_involvementId_fkey"
  FOREIGN KEY ("involvementId") REFERENCES "Involvement"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "Comment" DROP CONSTRAINT IF EXISTS "Comment_target_xor_check";
ALTER TABLE "Comment" ADD CONSTRAINT "Comment_target_xor_check"
  CHECK (
    (("ticketId" IS NOT NULL)::int
   + ("eventId" IS NOT NULL)::int
   + ("readingItemId" IS NOT NULL)::int
   + ("topicId" IS NOT NULL)::int
   + ("involvementId" IS NOT NULL)::int) = 1
  );
