import * as Sentry from '@sentry/nextjs';

import { initAnalytics } from '@/shared/analytics';
import {
  buildSentryClientTags,
  filterSentryEvent,
  resolveClientSentryDsn,
  SENTRY_DATA_COLLECTION,
} from '@/shared/lib/monitoring/sentry.helper';
import { isNativeApp, nativeBridgeChannel } from '@/shared/native';

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
