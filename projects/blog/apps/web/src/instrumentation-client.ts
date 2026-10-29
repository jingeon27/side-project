import { sentryPrivacyOptions } from '@/shared/lib/analytics/sentry';

// Keep the optional SDK out of the initial reader bundle when no DSN is set.
async function initializeSentry() {
  try {
    const Sentry = await import('@sentry/nextjs');
    Sentry.init({
      dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
      environment: process.env.NEXT_PUBLIC_SENTRY_ENVIRONMENT || process.env.NODE_ENV,
      release: process.env.NEXT_PUBLIC_SENTRY_RELEASE,
      ...sentryPrivacyOptions,
      tracesSampleRate: process.env.NODE_ENV === 'production' ? 0.1 : 0,
      replaysSessionSampleRate: 0,
      replaysOnErrorSampleRate: 0,
      maxBreadcrumbs: 30,
    });
    return Sentry;
  } catch {
    return undefined;
  }
}

const sentry = process.env.NEXT_PUBLIC_SENTRY_DSN ? initializeSentry() : undefined;

export const onRouterTransitionStart: typeof import('@sentry/nextjs').captureRouterTransitionStart = async (
  ...args
) => {
  try {
    const Sentry = await sentry;
    Sentry?.captureRouterTransitionStart(...args);
  } catch {
    /* 선택적 모니터링 실패가 탐색을 방해하지 않게 한다. */
  }
};
