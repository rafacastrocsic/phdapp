-- Informational alternate emails on the Student row (JSON array of
-- strings). Mirror of User.alternateEmails so students who don't have a
-- User row yet, and supervisors filling in a student's profile, can both
-- attach extra contact emails. Display only — not used for login or
-- notifications.

ALTER TABLE "Student" ADD COLUMN "alternateEmails" TEXT;
