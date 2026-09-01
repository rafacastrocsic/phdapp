-- Priority (high | medium | low) on My Work involvements.
ALTER TABLE "Involvement" ADD COLUMN "priority" TEXT NOT NULL DEFAULT 'medium';
