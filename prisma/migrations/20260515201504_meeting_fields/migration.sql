-- AlterTable
ALTER TABLE "Event" ADD COLUMN     "agenda" TEXT,
ADD COLUMN     "isMeeting" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "meetingNotes" TEXT;

