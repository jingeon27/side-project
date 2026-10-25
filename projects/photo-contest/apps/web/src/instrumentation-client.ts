import * as Sentry from '@sentry/nextjs';

import { readNativeAppInfo } from '@photo-contest/bridge/web';

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
    dataCollection: SENTRY_DATA_COLLECTION,
    // 성능 추적은 쓰지 않는다(소스맵·트레이스 업로드 토큰이 없다).
    tracesSampleRate: 0,
    traceLifecycle: 'static',
    beforeSend: scrubSentryEvent,
    beforeSendTransaction: scrubSentryEvent,
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
