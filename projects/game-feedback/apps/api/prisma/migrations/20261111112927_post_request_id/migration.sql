-- 게시 요청 키. 같은 작성자가 같은 키로 다시 보내면 처음 글을 돌려준다. 기존 행과 키 없이 만든 글은 NULL이라
-- unique에 걸리지 않는다.
--
-- CONCURRENTLY를 쓰지 않는다(20261027000000_lookup_indexes와 같은 이유: 병렬 migrate deploy와의 교착). 새 열이라
-- 기존 행은 모두 NULL이고 중복이 없다. 비공개 알파 규모라 빌드 동안의 짧은 쓰기 잠금을 받아들인다. 행이 많아지면
-- 배포 전에 운영자가 `ALTER TABLE "Post" ADD COLUMN IF NOT EXISTS "clientRequestId" TEXT`를 실행한 뒤 같은 이름으로
-- `CREATE UNIQUE INDEX CONCURRENTLY IF NOT EXISTS "Post_authorId_clientRequestId_key" ON "Post"("authorId", "clientRequestId")`를
-- 먼저 실행한다. 그러면 아래 두 IF NOT EXISTS 문장은 표를 다시 읽지 않고 지나간다.
ALTER TABLE "Post" ADD COLUMN IF NOT EXISTS "clientRequestId" TEXT;

-- migration-lint: allow CREATE UNIQUE INDEX — 새 열이라 기존 행은 NULL로 중복이 없고, 알파 규모의 짧은 쓰기 잠금이며 큰 표는 같은 이름의 CONCURRENTLY 사전 빌드로 대신한다
CREATE UNIQUE INDEX IF NOT EXISTS "Post_authorId_clientRequestId_key" ON "Post"("authorId", "clientRequestId");
