import { createHash } from 'node:crypto';

import type { IEventProperties } from './events';

type TServerEvent = keyof Pick<IEventProperties, 'purchase_verified' | 'report_issued' | 'refund_requested'>;

export async function trackOrder(
  events: TServerEvent[],
  purchase: { id: string; deviceId: string | null; product: 'job-week' | 'parent-week' },
) {
  const key = process.env.NEXT_PUBLIC_DEOKDAM_AMPLITUDE_KEY?.trim();
  if (!key || !purchase.deviceId) return;
  try {
    await fetch('https://api2.amplitude.com/2/httpapi', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        api_key: key,
        events: events.map((name) => ({
          event_type: name,
          device_id: purchase.deviceId,
          insert_id: createHash('sha256').update(purchase.id).update(name).digest('hex'),
          event_properties: { product: purchase.product },
        })),
      }),
      signal: AbortSignal.timeout(800),
    });
  } catch {
    // Measurement failures do not change the order or report.
  }
}
