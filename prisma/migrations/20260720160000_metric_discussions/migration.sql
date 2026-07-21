-- Track discussion-comment volume in the daily adoption snapshot so the
-- admin dashboard can draw a Discussions trend line. Defaults to 0 for
-- snapshots taken before the Discussions module existed.

ALTER TABLE "MetricSnapshot"
  ADD COLUMN "discussionComments30" INTEGER NOT NULL DEFAULT 0;
