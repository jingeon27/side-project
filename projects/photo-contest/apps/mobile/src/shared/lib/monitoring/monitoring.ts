import { captureException, captureMessage, init, wrap } from '@sentry/react-native';

import { SENTRY_DSN } from '@/shared/config/env';

import { createMonitoring } from './create-monitoring';

/** DSN이 없으면 초기화·보고를 건너뛰고 루트 컴포넌트를 그대로 반환한다. */
export const {
  init: initMonitoring,
  wrap: withMonitoring,
  captureWarning,
  captureError,
} = createMonitoring({
  dsn: SENTRY_DSN,
  sdk: { init, wrap, captureMessage, captureException },
});
