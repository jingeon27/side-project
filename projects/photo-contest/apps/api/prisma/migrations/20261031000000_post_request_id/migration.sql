ALTER TABLE "Post" ADD COLUMN "clientRequestId" TEXT;

-- migration-lint: allow CREATE UNIQUE INDEX — 기존 행은 NULL로 보존하며 알파 규모의 게시 요청 중복을 원자적으로 막는다
CREATE UNIQUE INDEX "Post_authorId_clientRequestId_key" ON "Post"("authorId", "clientRequestId");
