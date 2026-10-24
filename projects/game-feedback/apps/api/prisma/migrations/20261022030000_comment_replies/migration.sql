ALTER TABLE "Comment" ADD COLUMN "parentId" TEXT;

CREATE UNIQUE INDEX "Comment_id_postId_key" ON "Comment"("id", "postId");
CREATE INDEX "Comment_parentId_postId_idx" ON "Comment"("parentId", "postId");

ALTER TABLE "Comment" ADD CONSTRAINT "Comment_parentId_postId_fkey"
  FOREIGN KEY ("parentId", "postId") REFERENCES "Comment"("id", "postId")
  ON DELETE NO ACTION ON UPDATE NO ACTION;

ALTER TABLE "Comment" ADD CONSTRAINT "Comment_parent_not_self"
  CHECK ("parentId" IS NULL OR "parentId" <> "id");

ALTER TABLE "Notification" ADD COLUMN "commentId" TEXT;
CREATE INDEX "Notification_commentId_idx" ON "Notification"("commentId");
ALTER TABLE "Notification" ADD CONSTRAINT "Notification_commentId_fkey"
  FOREIGN KEY ("commentId") REFERENCES "Comment"("id") ON DELETE CASCADE ON UPDATE CASCADE;
