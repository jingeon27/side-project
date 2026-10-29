ALTER TABLE "Contest" ADD COLUMN "startNotifiedAt" TIMESTAMP(3), ADD COLUMN "endNotifiedAt" TIMESTAMP(3);
-- 도입 전에 이미 지난 시작·종료 알림을 일괄 발송하지 않는다.
UPDATE "Contest" SET "startNotifiedAt" = CURRENT_TIMESTAMP WHERE "startsAt" <= CURRENT_TIMESTAMP;
UPDATE "Contest" SET "endNotifiedAt" = CURRENT_TIMESTAMP WHERE "endsAt" <= CURRENT_TIMESTAMP;

CREATE TABLE "Notification" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "actorId" TEXT,
  "groupId" TEXT NOT NULL,
  "postId" TEXT,
  "commentId" TEXT,
  "contestId" TEXT,
  "joinRequestId" TEXT,
  "type" TEXT NOT NULL,
  "eventKey" TEXT NOT NULL,
  "readAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "Notification_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "Notification_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "Notification_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT "Notification_groupId_fkey" FOREIGN KEY ("groupId") REFERENCES "Group"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "Notification_postId_fkey" FOREIGN KEY ("postId") REFERENCES "Post"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "Notification_commentId_fkey" FOREIGN KEY ("commentId") REFERENCES "PostComment"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "Notification_contestId_fkey" FOREIGN KEY ("contestId") REFERENCES "Contest"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "Notification_joinRequestId_fkey" FOREIGN KEY ("joinRequestId") REFERENCES "GroupJoinRequest"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "Notification_target_check" CHECK (
    ("type" IN ('POST_COMMENT', 'COMMENT_REPLY') AND "postId" IS NOT NULL AND "commentId" IS NOT NULL AND "contestId" IS NULL AND "joinRequestId" IS NULL)
    OR ("type" IN ('CONTEST_STARTED', 'CONTEST_ENDED') AND "contestId" IS NOT NULL AND "postId" IS NULL AND "commentId" IS NULL AND "joinRequestId" IS NULL)
    OR ("type" IN ('JOIN_APPROVED', 'JOIN_REJECTED') AND "postId" IS NULL AND "commentId" IS NULL AND "contestId" IS NULL AND "joinRequestId" IS NULL)
    OR ("type" = 'JOIN_REQUESTED' AND "joinRequestId" IS NOT NULL AND "postId" IS NULL AND "commentId" IS NULL AND "contestId" IS NULL)
  )
);
CREATE UNIQUE INDEX "Notification_userId_eventKey_key" ON "Notification"("userId", "eventKey");
CREATE INDEX "Notification_userId_readAt_createdAt_id_idx" ON "Notification"("userId", "readAt", "createdAt", "id");
CREATE INDEX "Notification_groupId_idx" ON "Notification"("groupId");
CREATE INDEX "Notification_postId_idx" ON "Notification"("postId");
CREATE INDEX "Notification_commentId_idx" ON "Notification"("commentId");
CREATE INDEX "Notification_contestId_idx" ON "Notification"("contestId");
CREATE INDEX "Notification_joinRequestId_idx" ON "Notification"("joinRequestId");
