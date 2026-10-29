import { sha256Hex } from '../common/crypto';
import type { TDatabaseClient } from '../database/database.service';
import type { IAnalyticsEvent } from './analytics-event';

/** 원본 보관 기간이 지나도 동일한 사실을 다시 집계하지 않는다. tx 안팎 모두 한 SQL로 기록한다. */
export async function recordEvent(client: TDatabaseClient, event: IAnalyticsEvent) {
  await client.$executeRaw`
    WITH receipt AS (
      INSERT INTO "AnalyticsEventReceipt" ("keyHash") VALUES (${sha256Hex(event.id)})
      ON CONFLICT DO NOTHING RETURNING "keyHash"
    )
    INSERT INTO "AnalyticsEvent" ("id", "type", "userId", "properties", "createdAt")
    SELECT ${event.id}, ${event.type}, ${event.userId}, ${JSON.stringify(event.properties)}::jsonb, CURRENT_TIMESTAMP
    FROM receipt ON CONFLICT ("id") DO NOTHING
  `;
}
