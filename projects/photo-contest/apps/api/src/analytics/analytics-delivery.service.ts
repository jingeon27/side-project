import { Injectable } from '@nestjs/common';

import { amplitudeApiKey, amplitudeEndpoint } from '../config/env';
import { ANALYTICS_TIMEOUT_MS, CLEANUP_BATCH_SIZE } from '../config/limits';
import { Database } from '../database/database.service';

@Injectable()
export class AnalyticsDeliveryService {
  constructor(private readonly db: Database) {}

  /**
   * 보내지 않은 이벤트를 한 묶음 Amplitude로 보낸다. 실패하면 표시하지 않고 던져서
   * 다음 실행이 같은 insert_id로 다시 보내게 한다(Amplitude가 중복을 걸러 준다).
   * @returns 전송한 이벤트 수
   */
  async deliver(): Promise<number> {
    const apiKey = amplitudeApiKey();
    if (!apiKey) return 0;
    const events = await this.db.analyticsEvent.findMany({
      where: { deliveredAt: null },
      orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
      take: CLEANUP_BATCH_SIZE,
    });
    if (!events.length) return 0;
    const response = await fetch(amplitudeEndpoint(), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        api_key: apiKey,
        events: events.map((event) => ({
          insert_id: event.id,
          event_type: event.type,
          user_id: event.userId ?? undefined,
          device_id: event.userId ? undefined : `contest:${event.id}`,
          time: event.createdAt.getTime(),
          event_properties: event.properties,
        })),
      }),
      signal: AbortSignal.timeout(ANALYTICS_TIMEOUT_MS),
    });
    if (!response.ok) throw new Error(`Analytics delivery failed (${response.status})`);
    await this.db.analyticsEvent.updateMany({
      where: { id: { in: events.map((event) => event.id) } },
      data: { deliveredAt: new Date() },
    });
    return events.length;
  }
}
