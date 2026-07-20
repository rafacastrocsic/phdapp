-- Document-style comments: an ordered array of content blocks (text +
-- files) so a Discussion comment can interleave paragraphs and images in
-- the author's order, like writing a document. Derived body/attachments
-- keep older code paths working.

ALTER TABLE "Comment" ADD COLUMN "blocks" TEXT;
