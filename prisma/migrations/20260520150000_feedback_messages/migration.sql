-- Threaded replies on Feedback. The author and any admin can post.
-- The legacy Feedback.adminReply column stays for historical rows;
-- new replies live here.

CREATE TABLE "FeedbackMessage" (
  "id"         TEXT NOT NULL PRIMARY KEY,
  "feedbackId" TEXT NOT NULL,
  "authorId"   TEXT NOT NULL,
  "body"       TEXT NOT NULL,
  "editedAt"   TIMESTAMP(3),
  "createdAt"  TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "FeedbackMessage_feedbackId_fkey"
    FOREIGN KEY ("feedbackId") REFERENCES "Feedback"("id")
    ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "FeedbackMessage_authorId_fkey"
    FOREIGN KEY ("authorId") REFERENCES "User"("id")
    ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX "FeedbackMessage_feedbackId_createdAt_idx"
  ON "FeedbackMessage"("feedbackId", "createdAt");
