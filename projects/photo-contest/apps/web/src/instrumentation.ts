import * as Sentry from '@sentry/nextjs';

import { assertAppLinksConfig } from '@/shared/lib/app-links.helper';
import { resolveServerSentryDsn, scrubSentryEvent, SENTRY_DATA_COLLECTION } from '@/shared/lib/sentry.helper';

/** Next 서버가 뜰 때 한 번. 서버 렌더링·라우트 오류를 Sentry로 보낸다. DSN이 없으면 켜지 않는다. */
export function register() {
  if (process.env.NEXT_RUNTIME !== 'nodejs') return;
  // 운영에서 앱 링크 값이 없으면 첫 요청(헬스 체크)부터 실패시켜 배포를 멈춘다. 빌드 단계에서는 Next가 부르지 않는다.
  assertAppLinksConfig(process.env);
  const dsn = resolveServerSentryDsn(process.env);
  if (!dsn) return;
  Sentry.init({
    dsn,
    environment: process.env.NODE_ENV,
    dataCollection: SENTRY_DATA_COLLECTION,
    tracesSampleRate: 0,
    beforeSend: scrubSentryEvent,
    beforeSendTransaction: scrubSentryEvent,
  });
}

// 초기화하지 않았으면 아무것도 보내지 않는다.
export const onRequestError = Sentry.captureRequestError;
