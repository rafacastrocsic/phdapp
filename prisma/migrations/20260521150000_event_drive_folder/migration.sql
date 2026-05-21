-- Events can now carry a single Drive folder, like tasks.
-- Nullable; existing rows stay NULL.

ALTER TABLE "Event" ADD COLUMN "driveFolderUrl" TEXT;
