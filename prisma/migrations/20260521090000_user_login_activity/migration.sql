-- Admin-only "when did this user last touch the app?" markers.
--   lastLoginAt  — set on each successful Google sign-in
--   lastActiveAt — bumped on each authenticated page render (throttled)
-- Both nullable; existing rows stay NULL until the user signs in / browses.

ALTER TABLE "User" ADD COLUMN "lastLoginAt"  TIMESTAMP(3);
ALTER TABLE "User" ADD COLUMN "lastActiveAt" TIMESTAMP(3);
