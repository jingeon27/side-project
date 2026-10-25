import type { ComponentType } from 'react';

import { captureException, captureMessage, init, wrap } from '@sentry/react-native';

import { SENTRY_DSN } from '@/shared/config/env';

import { createMonitoring, type TMonitoringTags } from './create-monitoring';

const monitoring = createMonitoring({
  dsn: SENTRY_DSN,
  sdk: { init, wrap, captureMessage, captureException },
});

/** 루트를 등록하기 전에 한 번 부른다. NEXT_PUBLIC_SENTRY_DSN이 없으면 아무것도 하지 않는다. */
export function initMonitoring() {
  monitoring.init();
}

/** Sentry.wrap(터치 브레드크럼·프로파일러)으로 루트를 감싼다. DSN이 없으면 그대로 돌려준다. */
export function withMonitoring<P extends Record<string, unknown>>(component: ComponentType<P>) {
  return monitoring.wrap(component);
}

/** 사용자가 알아채기 어려운 운영 문제(WebView 로드 실패 등)를 경고로 남긴다. */
export function captureWarning(message: string, tags: TMonitoringTags) {
  monitoring.captureWarning(message, tags);
}

/** 오류 경계가 잡은 렌더 오류. 잡힌 오류는 전역 처리기로 가지 않아 직접 보낸다. */
export function captureError(error: unknown, componentStack?: string | null) {
  monitoring.captureError(error, componentStack);
}
