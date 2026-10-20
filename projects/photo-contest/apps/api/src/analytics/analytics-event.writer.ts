import type { TDatabaseClient } from '../database/database.service';
import type { IAnalyticsEvent } from './analytics-event';

/** 내부 지표용으로 DB에만 남긴다(외부 분석 도구로 보내지 않는다). 이미 있는 id면 그대로 둔다. */
export async function recordEvent(client: TDatabaseClient, event: IAnalyticsEvent) {
  await client.analyticsEvent.createMany({ data: [event], skipDuplicates: true });
}
