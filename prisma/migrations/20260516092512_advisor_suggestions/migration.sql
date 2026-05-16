-- AlterTable
ALTER TABLE "User" ADD COLUMN     "teamSuggestionsLastSeenAt" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "AdvisorSuggestion" (
    "id" TEXT NOT NULL,
    "authorId" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "studentIds" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AdvisorSuggestion_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "AdvisorSuggestion_createdAt_idx" ON "AdvisorSuggestion"("createdAt");

-- AddForeignKey
ALTER TABLE "AdvisorSuggestion" ADD CONSTRAINT "AdvisorSuggestion_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

