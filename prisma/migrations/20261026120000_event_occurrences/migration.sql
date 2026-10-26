-- Per-occurrence exceptions for repeating events (iCal/Google model): the
-- series stays one Event + RRULE, each deviation is a row keyed by the
-- occurrence's ORIGINAL start. cancelled = EXDATE; startsAt/endsAt = a move.
CREATE TABLE "EventOccurrence" (
  "id" TEXT NOT NULL,
  "eventId" TEXT NOT NULL,
  "originalStart" TIMESTAMP(3) NOT NULL,
  "cancelled" BOOLEAN NOT NULL DEFAULT false,
  "startsAt" TIMESTAMP(3),
  "endsAt" TIMESTAMP(3),
  "title" TEXT,
  "location" TEXT,
  "googleEventId" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "EventOccurrence_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "EventOccurrence_eventId_originalStart_key"
  ON "EventOccurrence"("eventId", "originalStart");
CREATE INDEX "EventOccurrence_eventId_idx" ON "EventOccurrence"("eventId");

ALTER TABLE "EventOccurrence" ADD CONSTRAINT "EventOccurrence_eventId_fkey"
  FOREIGN KEY ("eventId") REFERENCES "Event"("id") ON DELETE CASCADE ON UPDATE CASCADE;
