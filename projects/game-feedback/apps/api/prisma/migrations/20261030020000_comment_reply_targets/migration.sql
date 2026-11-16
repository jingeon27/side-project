ALTER TABLE "Comment" ADD COLUMN "replyToId" TEXT;

ALTER TABLE "Comment" ADD CONSTRAINT "Comment_replyToId_postId_fkey"
FOREIGN KEY ("replyToId", "postId") REFERENCES "Comment"("id", "postId")
ON DELETE NO ACTION ON UPDATE NO ACTION NOT VALID;

ALTER TABLE "Comment" VALIDATE CONSTRAINT "Comment_replyToId_postId_fkey";
