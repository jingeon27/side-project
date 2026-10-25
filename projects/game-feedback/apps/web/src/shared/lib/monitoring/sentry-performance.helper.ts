import type { init } from '@sentry/nextjs';

export type TPerformanceSpan = Parameters<NonNullable<Parameters<typeof init>[0]['beforeSendSpan']>>[0];

const PATH_SEGMENTS = new Set([
  'ko',
  'en',
  'ja',
  'posts',
  'users',
  'messages',
  'boards',
  'games',
  'feedback',
  'friend-sale',
  'friendly',
  'coaching',
  'free',
  'write',
  'notifications',
  'settings',
  'search',
  'guide',
  'terms',
  'privacy',
  'contact',
  'login',
  'onboarding',
  'unavailable',
]);
const PERFORMANCE_ATTRIBUTES = new Set([
  'sentry.op',
  'sentry.origin',
  'sentry.segment.id',
  'sentry.pageload.span_id',
  'sentry.sdk.name',
  'sentry.sdk.version',
  'sentry.sdk.integrations',
  'sentry.release',
  'sentry.environment',
  'sentry.trace_lifecycle',
  'sentry.exclusive_time',
  'sentry.segment.name_source',
  'sentry.source',
  'browser.navigation.type',
  'user_agent.original',
  'service',
  'layer',
  'client',
]);

/** 실제 ID·검색어 대신 화면 경로 단위로 성능을 집계한다. */
export function sentryPerformancePath(value: string) {
  try {
    const path = new URL(value, 'https://local.invalid').pathname;
    return (
      '/' +
      path
        .split('/')
        .filter(Boolean)
        .map((part) => (PATH_SEGMENTS.has(part) ? part : ':id'))
        .join('/')
    );
  } catch {
    return '/unknown';
  }
}

/** Sentry 11의 span 전송에는 오류 beforeSend가 적용되지 않아 별도로 제거한다. */
export function scrubSentryPerformanceSpan(span: TPerformanceSpan): TPerformanceSpan {
  const op = span.attributes['sentry.op'];
  const operation = typeof op === 'string' && /^[a-z0-9_.-]{1,80}$/i.test(op) ? op : 'browser.performance';
  const attributes = Object.fromEntries(
    Object.entries(span.attributes).flatMap(([key, value]) => {
      if (key === 'sentry.segment.name' || key === 'sentry.transaction')
        return typeof value === 'string' ? [[key, sentryPerformancePath(value)]] : [];
      if (PERFORMANCE_ATTRIBUTES.has(key)) return [[key, value]];
      if (
        /^browser\.web_vital\.(lcp|cls|inp|fcp|ttfb|fp)\.(value|load_time|render_time|size|request_time)$/.test(
          key,
        ) &&
        typeof value === 'number' &&
        Number.isFinite(value)
      )
        return [[key, value]];
      return [];
    }),
  );
  delete span.links;
  return {
    ...span,
    name: span.is_segment ? sentryPerformancePath(span.name) : operation,
    attributes,
  };
}
