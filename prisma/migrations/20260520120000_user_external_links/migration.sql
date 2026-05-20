-- Add external profile links to User (LinkedIn / ORCID / Google Scholar).
-- Students keep their own copies on the Student row; this adds Scholar
-- there too so every user has a scholarUrl available.

ALTER TABLE "User"
  ADD COLUMN "linkedinUrl" TEXT,
  ADD COLUMN "orcidId"     TEXT,
  ADD COLUMN "scholarUrl"  TEXT;

ALTER TABLE "Student"
  ADD COLUMN "scholarUrl"  TEXT;
