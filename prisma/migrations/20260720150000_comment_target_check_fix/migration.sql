-- The Comment target CHECK constraint only allowed ticketId XOR eventId, so
-- it was never widened when readingItemId (reading comments) and topicId
-- (discussion comments) were added. Every insert with one of those set
-- therefore violated "Comment_target_xor_check" and failed — no reading or
-- discussion comment could be created. Broaden it to "exactly one of the
-- four target columns is non-null".

ALTER TABLE "Comment" DROP CONSTRAINT IF EXISTS "Comment_target_xor_check";

ALTER TABLE "Comment" ADD CONSTRAINT "Comment_target_xor_check"
  CHECK (
    (("ticketId" IS NOT NULL)::int
   + ("eventId" IS NOT NULL)::int
   + ("readingItemId" IS NOT NULL)::int
   + ("topicId" IS NOT NULL)::int) = 1
  );
