-- Chat polls — Poll/PollOption/PollVote tables, one-to-one with Message.

CREATE TABLE "Poll" (
    "id" TEXT NOT NULL,
    "messageId" TEXT NOT NULL,
    "question" TEXT NOT NULL,
    "multiVote" BOOLEAN NOT NULL DEFAULT false,
    "closesAt" TIMESTAMP(3),
    "closedAt" TIMESTAMP(3),
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "Poll_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "Poll_messageId_key" ON "Poll"("messageId");

ALTER TABLE "Poll" ADD CONSTRAINT "Poll_messageId_fkey"
  FOREIGN KEY ("messageId") REFERENCES "Message"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "Poll" ADD CONSTRAINT "Poll_createdById_fkey"
  FOREIGN KEY ("createdById") REFERENCES "User"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE TABLE "PollOption" (
    "id" TEXT NOT NULL,
    "pollId" TEXT NOT NULL,
    "text" TEXT NOT NULL,
    "order" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "PollOption_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "PollOption_pollId_order_idx" ON "PollOption"("pollId", "order");

ALTER TABLE "PollOption" ADD CONSTRAINT "PollOption_pollId_fkey"
  FOREIGN KEY ("pollId") REFERENCES "Poll"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "PollVote" (
    "id" TEXT NOT NULL,
    "optionId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "PollVote_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "PollVote_optionId_userId_key" ON "PollVote"("optionId", "userId");
CREATE INDEX "PollVote_userId_idx" ON "PollVote"("userId");

ALTER TABLE "PollVote" ADD CONSTRAINT "PollVote_optionId_fkey"
  FOREIGN KEY ("optionId") REFERENCES "PollOption"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "PollVote" ADD CONSTRAINT "PollVote_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;
