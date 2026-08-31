-- Optional checklist on a My Work involvement. JSON array of
-- { id, text, done }; when non-empty the item's progress % is derived from
-- how many are ticked rather than set by hand.

ALTER TABLE "Involvement" ADD COLUMN "checklist" TEXT;
