import { sentryPrivacyOptions } from '@/shared/lib/analytics/sentry';

// Keep the optional SDK out of the initial reader bundle when no DSN is set.
const sentry = process.env.NEXT_PUBLIC_SENTRY_DSN
  ? import('@sentry/nextjs')
      .then((Sentry) => {
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
      })
      .catch(() => undefined)
  : undefined;

export const onRouterTransitionStart: typeof import('@sentry/nextjs').captureRouterTransitionStart = (
  ...args
) => {
  void sentry?.then((Sentry) => Sentry?.captureRouterTransitionStart(...args)).catch(() => undefined);
};
