import { createInstance } from '@amplitude/analytics-browser';
import type { TAnalyticsEventName, TAnalyticsProperties } from './analytics.catalog';
import { analyticsEnrichment } from './analytics.enrichment';

let client: ReturnType<typeof createInstance> | null = null;
export function initAnalytics(apiKey: string | undefined) {
  if (typeof window === 'undefined' || !apiKey?.trim() || client) return;
  const instance = createInstance();
  instance.add(analyticsEnrichment());
  instance.init(apiKey, {
    serverZone: 'US',
    fetchRemoteConfig: false,
    trackingOptions: { ipAddress: false },
    customEnrichment: false,
    autocapture: {
      pageUrlEnrichment: false,
      pageViews: { trackHistoryChanges: 'all' },
      sessions: true,
      formInteractions: true,
      attribution: true,
      elementInteractions: false,
      fileDownloads: false,
      networkTracking: false,
      webVitals: false,
    },
  });
  client = instance;
}
export function trackEvent<TName extends TAnalyticsEventName>(
  name: TName,
  properties: TAnalyticsProperties[TName],
) {
  client?.track(name, properties);
}
export function identifyUser(id: string) {
  if (client?.getUserId() !== id) client?.setUserId(id);
}
export function resetAnalytics() {
  if (client?.getUserId() !== undefined) client?.reset();
}
export async function flushAnalytics(timeoutMs = 400) {
  if (!client) return;
  await Promise.race([
    client.flush().promise.catch(() => undefined),
    new Promise<void>((resolve) => setTimeout(resolve, timeoutMs)),
  ]);
}
export function resetAnalyticsClientForTest() {
  client = null;
}
