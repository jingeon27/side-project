import type * as Sentry from '@sentry/react-native';
import type { ComponentType } from 'react';

export type TMonitoringSdk = Pick<typeof Sentry, 'init' | 'wrap' | 'captureMessage' | 'captureException'>;

/** 운영 경고에 붙이는 태그. 값에 닉네임·초대 토큰·URL 같은 개인정보를 넣지 않는다. */
export type TMonitoringTags = Record<string, string>;

interface ICreateMonitoringOptions {
  /** 없으면 초기화하지 않고 아무것도 보내지 않는다(개발·테스트 빌드). */
  dsn: string | null;
  sdk: TMonitoringSdk;
}

/** 요청 URL(초대 토큰이 들어갈 수 있다) 같은 브레드크럼 데이터를 남기지 않는다. */
export function scrubBreadcrumb({ data: _data, ...breadcrumb }: Sentry.Breadcrumb): Sentry.Breadcrumb {
  return breadcrumb;
}

/** 사용자·요청 정보와 브레드크럼 데이터를 빼고 보낸다. */
export function scrubEvent({
  user: _user,
  request: _request,
  ...event
}: Sentry.ErrorEvent): Sentry.ErrorEvent {
  return event.breadcrumbs ? { ...event, breadcrumbs: event.breadcrumbs.map(scrubBreadcrumb) } : event;
}

/** Sentry 연결. 판단만 하고 SDK는 주입받아 DSN이 없을 때 아무것도 하지 않는지 테스트한다. */
export function createMonitoring({ dsn, sdk }: ICreateMonitoringOptions) {
  return {
    init: () => {
      if (!dsn) return;
      sdk.init({
        dsn,
        sendDefaultPii: false,
        beforeSend: scrubEvent,
        // 네이티브 크래시 보고에도 같은 브레드크럼이 실리므로 만들 때부터 데이터를 뺀다.
        beforeBreadcrumb: scrubBreadcrumb,
      });
    },
    wrap: <P extends Record<string, unknown>>(component: ComponentType<P>): ComponentType<P> =>
      dsn ? sdk.wrap(component) : component,
    captureWarning: (message: string, tags: TMonitoringTags) => {
      if (dsn) sdk.captureMessage(message, { level: 'warning', tags });
    },
    captureError: (error: unknown, componentStack?: string | null) => {
      if (!dsn) return;
      if (componentStack) sdk.captureException(error, { contexts: { react: { componentStack } } });
      else sdk.captureException(error);
    },
  };
}
