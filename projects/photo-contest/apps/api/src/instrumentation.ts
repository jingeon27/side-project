import { init } from '@sentry/node';

import { sentryDsn } from './config/env';

const dsn = sentryDsn();

if (dsn)
  init({
    dsn,
    environment: process.env.NODE_ENV,
    sendDefaultPii: false,
    defaultIntegrations: false,
    // 오류 보고에 요청 본문·쿠키·사용자 정보가 실리지 않게 한다.
    beforeSend(event) {
      delete event.request;
      delete event.user;
      delete event.breadcrumbs;
      return event;
    },
  });
