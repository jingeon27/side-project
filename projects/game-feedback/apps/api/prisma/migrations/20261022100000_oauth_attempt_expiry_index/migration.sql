-- CreateIndex
-- migration-lint: allow CREATE INDEX — 배포 전이라 운영 데이터 없음, OAuthAttempt는 10분 수명의 작은 테이블
CREATE INDEX "OAuthAttempt_expiresAt_idx" ON "OAuthAttempt"("expiresAt");
