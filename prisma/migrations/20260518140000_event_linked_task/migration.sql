-- AlterTable
ALTER TABLE "Event" ADD COLUMN     "linkedTaskId" TEXT;

-- CreateIndex
CREATE INDEX "Event_linkedTaskId_idx" ON "Event"("linkedTaskId");

-- AddForeignKey
ALTER TABLE "Event" ADD CONSTRAINT "Event_linkedTaskId_fkey" FOREIGN KEY ("linkedTaskId") REFERENCES "Ticket"("id") ON DELETE SET NULL ON UPDATE CASCADE;
