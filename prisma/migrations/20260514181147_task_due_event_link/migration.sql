-- AlterTable
ALTER TABLE "Event" ADD COLUMN     "ticketId" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "Event_ticketId_key" ON "Event"("ticketId");

-- AddForeignKey
ALTER TABLE "Event" ADD CONSTRAINT "Event_ticketId_fkey" FOREIGN KEY ("ticketId") REFERENCES "Ticket"("id") ON DELETE CASCADE ON UPDATE CASCADE;
