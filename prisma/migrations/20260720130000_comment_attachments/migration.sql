-- Email-style attachments (images + documents) on comments. JSON array of
-- { name, url, mimeType, size }. Currently only the Discussions module writes
-- this; files live in permanent Blob storage (no auto-cleanup).

ALTER TABLE "Comment" ADD COLUMN "attachments" TEXT;
