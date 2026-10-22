-- AlterTable
ALTER TABLE "PostView" ADD COLUMN     "networkHash" TEXT;

-- CreateIndex
-- migration-lint: allow CREATE INDEX — 배포 전이라 운영 데이터 없음
CREATE INDEX "PostView_postId_networkHash_lastViewedAt_idx" ON "PostView"("postId", "networkHash", "lastViewedAt");
