-- Availability: add an optional PUBLIC "reason" column. Empty falls
-- back to a generic "Unavailable" label on the calendar. The
-- existing private "label" column is unchanged (now author-only memo).

ALTER TABLE "Availability" ADD COLUMN "reason" TEXT;
