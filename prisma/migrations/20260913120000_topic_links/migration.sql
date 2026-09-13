-- Connect a discussion topic to a task, a calendar event and/or a chat
-- channel (optional shortcuts; they don't affect visibility). All nullable,
-- ON DELETE SET NULL so removing the target just clears the link.
ALTER TABLE "Topic" ADD COLUMN "linkedTaskId" TEXT;
ALTER TABLE "Topic" ADD COLUMN "linkedEventId" TEXT;
ALTER TABLE "Topic" ADD COLUMN "linkedChannelId" TEXT;

ALTER TABLE "Topic" ADD CONSTRAINT "Topic_linkedTaskId_fkey"
  FOREIGN KEY ("linkedTaskId") REFERENCES "Ticket"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Topic" ADD CONSTRAINT "Topic_linkedEventId_fkey"
  FOREIGN KEY ("linkedEventId") REFERENCES "Event"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Topic" ADD CONSTRAINT "Topic_linkedChannelId_fkey"
  FOREIGN KEY ("linkedChannelId") REFERENCES "Channel"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE INDEX "Topic_linkedTaskId_idx" ON "Topic"("linkedTaskId");
CREATE INDEX "Topic_linkedEventId_idx" ON "Topic"("linkedEventId");
CREATE INDEX "Topic_linkedChannelId_idx" ON "Topic"("linkedChannelId");
