-- PK가 포함되어 중복은 없지만 복합 FK의 대상 키가 필요하다. 알파 규모의 일반 빌드로 병렬 migrate의 교착을 피한다.
-- migration-lint: allow CREATE UNIQUE INDEX — 기존 PK를 포함한 복합 참조 키이며 알파 규모에서 병렬 migration 교착을 피한다
CREATE UNIQUE INDEX IF NOT EXISTS "Answer_id_postId_key" ON "Answer"("id", "postId");
-- migration-lint: allow CREATE UNIQUE INDEX — 기존 PK를 포함한 복합 참조 키이며 알파 규모에서 병렬 migration 교착을 피한다
CREATE UNIQUE INDEX IF NOT EXISTS "ChatMessage_id_conversationId_key" ON "ChatMessage"("id", "conversationId");

ALTER TABLE "Notification" ADD CONSTRAINT "Notification_answerId_postId_fkey"
  FOREIGN KEY ("answerId", "postId") REFERENCES "Answer"("id", "postId") ON DELETE CASCADE ON UPDATE NO ACTION NOT VALID;
ALTER TABLE "Notification" VALIDATE CONSTRAINT "Notification_answerId_postId_fkey";
ALTER TABLE "Notification" ADD CONSTRAINT "Notification_commentId_postId_fkey"
  FOREIGN KEY ("commentId", "postId") REFERENCES "Comment"("id", "postId") ON DELETE CASCADE ON UPDATE NO ACTION NOT VALID;
ALTER TABLE "Notification" VALIDATE CONSTRAINT "Notification_commentId_postId_fkey";
ALTER TABLE "ChatAttachment" ADD CONSTRAINT "ChatAttachment_messageId_conversationId_fkey"
  FOREIGN KEY ("messageId", "conversationId") REFERENCES "ChatMessage"("id", "conversationId") ON DELETE CASCADE ON UPDATE NO ACTION NOT VALID;
ALTER TABLE "ChatAttachment" VALIDATE CONSTRAINT "ChatAttachment_messageId_conversationId_fkey";

-- 새 복합 FK를 검증한 뒤 같은 삭제 동작을 가진 단일 FK만 교체한다. 행·열은 보존한다.
-- migration-lint: allow DROP CONSTRAINT — 검증을 마친 동일 게시물 복합 FK가 기존 단일 댓글 FK를 대체한다
ALTER TABLE "Notification" DROP CONSTRAINT "Notification_commentId_fkey";
-- migration-lint: allow DROP CONSTRAINT — 검증을 마친 동일 대화 복합 FK가 기존 단일 메시지 FK를 대체한다
ALTER TABLE "ChatAttachment" DROP CONSTRAINT "ChatAttachment_messageId_fkey";
