-- CreateIndex
-- migration-lint: allow CREATE INDEX — 배포 전이라 운영 데이터 없음
CREATE INDEX "Report_status_createdAt_id_idx" ON "Report"("status", "createdAt", "id");
