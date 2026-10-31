import dayjs from 'dayjs';

import { ANALYTICS_ARCHIVE_BATCH_SIZE, ANALYTICS_RETENTION_MS } from '../config/limits';
import type { TDatabaseClient } from '../database/database.service';

/** 집계와 삭제를 한 SQL로 커밋한다. 겹친 정리 작업은 잠긴 원본을 건너뛴다. */
export async function archiveAnalyticsEvents({
  client,
  now = dayjs().toDate(),
  batchSize = ANALYTICS_ARCHIVE_BATCH_SIZE,
}: {
  client: TDatabaseClient;
  now?: Date;
  batchSize?: number;
}) {
  const cutoff = dayjs(now.getTime() - ANALYTICS_RETENTION_MS).toDate();
  return client.$executeRaw`
    WITH expired AS (
      SELECT "id", "type", "createdAt"::date AS "day"
      FROM "AnalyticsEvent" WHERE "createdAt" < ${cutoff}
      ORDER BY "createdAt", "id" LIMIT ${batchSize} FOR UPDATE SKIP LOCKED
    ), receipts AS (
      INSERT INTO "AnalyticsEventReceipt" ("keyHash")
      SELECT encode(sha256(convert_to("id", 'UTF8')), 'hex') FROM expired
      ON CONFLICT DO NOTHING
    ), summarized AS (
      INSERT INTO "AnalyticsDailySummary" ("day", "type", "eventCount", "updatedAt")
      SELECT "day", "type", COUNT(*), CURRENT_TIMESTAMP FROM expired GROUP BY "day", "type"
      ORDER BY "day", "type"
      ON CONFLICT ("day", "type") DO UPDATE
      SET "eventCount" = "AnalyticsDailySummary"."eventCount" + EXCLUDED."eventCount", "updatedAt" = EXCLUDED."updatedAt"
    )
    DELETE FROM "AnalyticsEvent" AS e USING expired WHERE e."id" = expired."id"
  `;
}
