import * as Sentry from '@sentry/nextjs';
import { nativeBridgeChannel, isNativeApp } from '@/shared/native';
import { initAnalytics } from '@/shared/analytics';
import {
  SENTRY_DATA_COLLECTION,
  resolveClientSentryDsn,
  buildSentryClientTags,
  filterSentryEvent,
} from '@/shared/lib/monitoring/sentry.helper';

nativeBridgeChannel.start();
const dsn = resolveClientSentryDsn({ NEXT_PUBLIC_SENTRY_DSN: process.env.NEXT_PUBLIC_SENTRY_DSN });
if (dsn)
  Sentry.init({
    dsn,
    environment: process.env.NODE_ENV,
    dataCollection: SENTRY_DATA_COLLECTION,
    tracesSampleRate: 0,
    beforeSend: (event: Sentry.ErrorEvent, hint: Sentry.EventHint) => {
      const clean = filterSentryEvent(event, hint.originalException);
      if (!clean) return null;
      clean.tags = { ...clean.tags, ...buildSentryClientTags(isNativeApp()) };
      return clean;
    },
  });
initAnalytics(process.env.NEXT_PUBLIC_AMPLITUDE_API_KEY);
export const onRouterTransitionStart = Sentry.captureRouterTransitionStart;
