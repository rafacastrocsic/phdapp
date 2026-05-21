-- Track when a chat message was edited after being sent. Null on the
-- initial send; set to NOW() on every PATCH. The UI surfaces a small
-- "(edited)" suffix whenever this is non-null.

ALTER TABLE "Message" ADD COLUMN "editedAt" TIMESTAMP(3);
