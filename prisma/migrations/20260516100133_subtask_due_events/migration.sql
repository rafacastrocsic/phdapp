-- AlterTable
ALTER TABLE "Event" ADD COLUMN     "subtaskKey" TEXT,
ADD COLUMN     "subtaskParentId" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "Event_subtaskParentId_subtaskKey_key" ON "Event"("subtaskParentId", "subtaskKey");

-- AddForeignKey
ALTER TABLE "Event" ADD CONSTRAINT "Event_subtaskParentId_fkey" FOREIGN KEY ("subtaskParentId") REFERENCES "Ticket"("id") ON DELETE CASCADE ON UPDATE CASCADE;

