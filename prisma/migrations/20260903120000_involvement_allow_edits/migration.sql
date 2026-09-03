-- Per-item opt-in: when a shared involvement has allowEdits=true, other senior
-- members may edit its content (not delete it or change its sharing).
ALTER TABLE "Involvement" ADD COLUMN "allowEdits" BOOLEAN NOT NULL DEFAULT false;
