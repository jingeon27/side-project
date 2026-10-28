-- 공개 목록·상세가 거르는 열에 인덱스를 둔다.
-- Block(blockedUserId): UserVisibilityService가 나를 차단한 사람을 찾는다(userId 쪽은 기존 unique가 맡는다).
-- Notification(postId)·(answerId): 글 삭제·읽음과 답변 수정·삭제·도움됨이 알림을 지우거나 고친다.
-- Post(authorId, createdAt): 프로필 작성 글 목록(최신순)과 글 수. Answer(authorId): 프로필의 답변·도움됨 수.
--
-- CONCURRENTLY를 쓰지 않는다. migrate deploy는 DB 단위 advisory lock을 잡고, 같은 DB의 다른 스키마에 동시에
-- 배포하는 격리 테스트가 그 잠금을 기다리는 동안 CREATE INDEX CONCURRENTLY가 그 스냅샷을 기다려 교착한다
-- (실측: deadlock detected). 비공개 알파 규모의 표라 빌드 동안의 짧은 쓰기 잠금을 받아들인다. 행이 많아지면
-- 배포 전에 운영자가 같은 이름으로 `CREATE INDEX CONCURRENTLY IF NOT EXISTS`를 먼저 실행한다. 그러면 아래
-- IF NOT EXISTS 문장은 잠금 없이 지나간다.

-- migration-lint: allow CREATE INDEX — 알파 규모의 짧은 쓰기 잠금, 병렬 migrate deploy와의 CONCURRENTLY 교착 회피
CREATE INDEX IF NOT EXISTS "Block_blockedUserId_idx" ON "Block"("blockedUserId");

-- migration-lint: allow CREATE INDEX — 알파 규모의 짧은 쓰기 잠금, 병렬 migrate deploy와의 CONCURRENTLY 교착 회피
CREATE INDEX IF NOT EXISTS "Notification_postId_idx" ON "Notification"("postId");

-- migration-lint: allow CREATE INDEX — 알파 규모의 짧은 쓰기 잠금, 병렬 migrate deploy와의 CONCURRENTLY 교착 회피
CREATE INDEX IF NOT EXISTS "Notification_answerId_idx" ON "Notification"("answerId");

-- migration-lint: allow CREATE INDEX — 알파 규모의 짧은 쓰기 잠금, 병렬 migrate deploy와의 CONCURRENTLY 교착 회피
CREATE INDEX IF NOT EXISTS "Post_authorId_createdAt_idx" ON "Post"("authorId", "createdAt");

-- migration-lint: allow CREATE INDEX — 알파 규모의 짧은 쓰기 잠금, 병렬 migrate deploy와의 CONCURRENTLY 교착 회피
CREATE INDEX IF NOT EXISTS "Answer_authorId_idx" ON "Answer"("authorId");
