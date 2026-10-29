-- 조회수 중복 방지 기록의 만료 순회. 누적 Post.viewCount는 변경하지 않는다.
-- migration-lint: allow CREATE INDEX — 출시 전 소규모 테이블이며 격리 스키마에서도 원자적으로 적용한다.
CREATE INDEX IF NOT EXISTS "PostView_lastViewedAt_postId_visitorHash_idx"
  ON "PostView" ("lastViewedAt", "postId", "visitorHash");
