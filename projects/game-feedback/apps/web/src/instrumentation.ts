import type { Instrumentation } from 'next';

import {
  resolveSentryRelease,
  resolveServerSentryDsn,
  scrubSentryEvent,
  SENTRY_DATA_COLLECTION,
} from '@/shared/lib/monitoring/sentry.helper';

export async function register() {
  if (process.env.NEXT_RUNTIME !== 'nodejs' || process.env.NEXT_PHASE === 'phase-production-build') return;
  const dsn = resolveServerSentryDsn({
    SENTRY_DSN: process.env.SENTRY_DSN,
    NEXT_PUBLIC_SENTRY_DSN: process.env.NEXT_PUBLIC_SENTRY_DSN,
  });
  if (!dsn) return;
  const Sentry = await import('@sentry/nextjs');
  // 오류만 수집한다. Next 캐시/사전 렌더링의 span을 자동 계측하지 않는다.
  Sentry.init({
    dsn,
    defaultIntegrations: false,
    enableOpenTelemetrySetup: false,
    environment: process.env.ENVIRONMENT,
    release: resolveSentryRelease({ SENTRY_RELEASE: process.env.SENTRY_RELEASE }),
    dataCollection: SENTRY_DATA_COLLECTION,
    beforeSend: scrubSentryEvent,
  });
}
export async function onRequestError(...args: Parameters<Instrumentation.onRequestError>) {
  if (process.env.NEXT_RUNTIME !== 'nodejs') return;
  const Sentry = await import('@sentry/nextjs');
  return Sentry.captureRequestError(...args);
}
