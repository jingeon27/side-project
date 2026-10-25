import * as Sentry from '@sentry/nextjs';

import { initAnalytics } from '@/shared/analytics';
import {
  scrubSentryPerformanceSpan,
  sentryPerformancePath,
} from '@/shared/lib/monitoring/sentry-performance.helper';
import {
  buildSentryClientTags,
  filterSentryEvent,
  resolveClientSentryDsn,
  resolveSentryRelease,
  SENTRY_DATA_COLLECTION,
} from '@/shared/lib/monitoring/sentry.helper';
import { isNativeApp, nativeBridgeChannel } from '@/shared/native';

nativeBridgeChannel.start();
const dsn = resolveClientSentryDsn({ NEXT_PUBLIC_SENTRY_DSN: process.env.NEXT_PUBLIC_SENTRY_DSN });
if (dsn)
  Sentry.init({
    dsn,
    initialScope: { tags: { service: 'game-feedback', layer: 'browser' } },
    environment: process.env.ENVIRONMENT,
    release: resolveSentryRelease({ SENTRY_RELEASE: process.env.SENTRY_RELEASE }),
    dataCollection: SENTRY_DATA_COLLECTION,
    tracesSampleRate: 1,
    integrations: [
      Sentry.browserTracingIntegration({
        traceFetch: false,
        traceXHR: false,
        enableLongTask: false,
        enableLongAnimationFrame: false,
        beforeStartSpan: (options) => ({ ...options, name: sentryPerformancePath(options.name) }),
      }),
    ],
    beforeSendSpan: (span) =>
      scrubSentryPerformanceSpan({
        ...span,
        attributes: {
          ...span.attributes,
          service: 'game-feedback',
          layer: 'browser',
          ...buildSentryClientTags(isNativeApp()),
        },
      }),
    beforeSend: (event: Sentry.ErrorEvent, hint: Sentry.EventHint) => {
      const clean = filterSentryEvent(event, hint.originalException);
      if (!clean) return null;
      clean.tags = { ...clean.tags, ...buildSentryClientTags(isNativeApp()) };
      return clean;
    },
  });
initAnalytics(process.env.NEXT_PUBLIC_AMPLITUDE_API_KEY);
export const onRouterTransitionStart = Sentry.captureRouterTransitionStart;
