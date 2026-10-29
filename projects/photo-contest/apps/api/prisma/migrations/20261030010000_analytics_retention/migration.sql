CREATE TABLE "AnalyticsEventReceipt" (
  "keyHash" TEXT NOT NULL,
  CONSTRAINT "AnalyticsEventReceipt_pkey" PRIMARY KEY ("keyHash")
);
CREATE TABLE "AnalyticsDailySummary" (
  "day" DATE NOT NULL,
  "type" TEXT NOT NULL,
  "eventCount" BIGINT NOT NULL DEFAULT 0,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "AnalyticsDailySummary_pkey" PRIMARY KEY ("day", "type")
);
-- PostgreSQL 기본 sha256 함수로 기존 id의 단방향 키만 보존한다. 원본은 이 migration에서 지우지 않는다.
INSERT INTO "AnalyticsEventReceipt" ("keyHash")
  SELECT encode(sha256(convert_to("id", 'UTF8')), 'hex') FROM "AnalyticsEvent"
  ON CONFLICT DO NOTHING;
-- migration-lint: allow CREATE INDEX — 알파 규모의 원본 만료 탐색 인덱스이며 격리 스키마에 원자적으로 적용한다
CREATE INDEX IF NOT EXISTS "AnalyticsEvent_createdAt_id_idx" ON "AnalyticsEvent" ("createdAt", "id");
