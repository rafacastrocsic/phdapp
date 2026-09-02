-- Project Researcher personal workspace: a self-service Drive folder and
-- calendar stored on the User, plus a toggle to also share the folder with
-- the researcher's assigned students. All additive.
ALTER TABLE "User" ADD COLUMN "driveFolderId" TEXT;
ALTER TABLE "User" ADD COLUMN "calendarId" TEXT;
ALTER TABLE "User" ADD COLUMN "workspaceShareStudents" BOOLEAN NOT NULL DEFAULT false;
