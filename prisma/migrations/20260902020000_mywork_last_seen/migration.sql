-- Track when each user last opened My Work, to drive the unread badge for
-- shared-item activity (new shared items, updates, comments) by teammates.
ALTER TABLE "User" ADD COLUMN "myWorkLastSeenAt" TIMESTAMP(3);
