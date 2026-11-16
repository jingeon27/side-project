import * as Sentry from '@sentry/nextjs';

import { readNativeAppInfo } from '@photo-contest/bridge/web';

import { scrubSentryPerformanceSpan, sentryPerformancePath } from '@/shared/lib/sentry-performance.helper';
import {
  buildSentryClientTags,
  resolveClientSentryDsn,
  scrubSentryEvent,
  SENTRY_DATA_COLLECTION,
} from '@/shared/lib/sentry.helper';

// 화면이 상호작용 가능해지기 전에 한 번 실행된다. DSN이 없으면(로컬·e2e) Sentry를 켜지 않는다.
const dsn = resolveClientSentryDsn({ NEXT_PUBLIC_SENTRY_DSN: process.env.NEXT_PUBLIC_SENTRY_DSN });

if (dsn) {
  Sentry.init({
    dsn,
    environment: process.env.NODE_ENV,
    release: process.env.SENTRY_RELEASE?.trim() || undefined,
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
          service: 'photo-contest',
          layer: 'browser',
          ...buildSentryClientTags(readNativeAppInfo(window)),
        },
      }),
    beforeSend: scrubSentryEvent,
    // 앱이 문서 로드 전에 심은 앱 정보로 앱 WebView와 브라우저 오류를 나눈다.
    initialScope: {
      tags: {
        service: 'photo-contest',
        layer: 'browser',
        ...buildSentryClientTags(readNativeAppInfo(window)),
      },
    },
  });
}

export const onRouterTransitionStart = Sentry.captureRouterTransitionStart;
