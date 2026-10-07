-- Per-call colour so overlapping call windows stay readable in the grid.
-- Nullable: when blank, the API assigns a colour not already in use.
ALTER TABLE "Deadline" ADD COLUMN "color" TEXT;
