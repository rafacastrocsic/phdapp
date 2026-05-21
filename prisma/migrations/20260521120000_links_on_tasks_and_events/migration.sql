-- Multi-link list on tasks and events (papers, websites, repos…).
-- JSON-in-String to mirror the existing Ticket.subtasks / Event.agenda
-- pattern. Both nullable; existing rows stay NULL.

ALTER TABLE "Ticket" ADD COLUMN "links" TEXT;
ALTER TABLE "Event"  ADD COLUMN "links" TEXT;
