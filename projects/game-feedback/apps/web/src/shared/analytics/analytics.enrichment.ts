import type { Types } from '@amplitude/analytics-browser';

import { resolveAppRoute } from '@game-feedback/bridge';

import { isNativeApp } from '@/shared/native';

export function viewportBucket(width: number) {
  if (width < 360) return '<360';
  if (width < 480) return '360-479';
  if (width < 768) return '480-767';
  if (width < 1024) return '768-1023';
  return '1024+';
}
export function analyticsContext({
  pathname,
  width,
  locale,
  native,
}: {
  pathname: string;
  width: number;
  locale: string;
  native: boolean;
}) {
  const route = resolveAppRoute(pathname);
  return {
    client: native ? 'webview' : 'browser',
    viewport_bucket: viewportBucket(width),
    locale: route?.locale ?? locale.split('-')[0],
    screen: route?.screen ?? 'unknown',
  };
}
function withoutQuery(value: string) {
  if (!value || value === 'EMPTY' || value === '-') return value;
  try {
    const url = new URL(value, typeof location === 'undefined' ? 'https://local.invalid' : location.origin);
    return /^https?:$/.test(url.protocol)
      ? value.startsWith('/')
        ? url.pathname
        : url.origin + url.pathname
      : '';
  } catch {
    return value.split(/[?#]/)[0] ?? '';
  }
}
function scrubValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(scrubValue);
  if (value && typeof value === 'object') return scrubAnalyticsProperties(value as Record<string, unknown>);
  return value;
}
export function scrubAnalyticsProperties(properties: object | undefined) {
  const output: Record<string, unknown> = Object.fromEntries(Object.entries(properties ?? {}));
  for (const [key, value] of Object.entries(output)) {
    if (/(?:title|query|search|fragment)(?:\])?$/i.test(key)) {
      delete output[key];
      continue;
    }
    if (typeof value === 'string' && /(?:url|location|referrer|destination)/i.test(key)) {
      output[key] = withoutQuery(value);
      continue;
    }
    output[key] = scrubValue(value);
  }
  return output;
}
export function analyticsEnrichment(): Types.EnrichmentPlugin {
  return {
    name: 'game-feedback-context',
    type: 'enrichment',
    async execute(event) {
      event.user_properties = scrubAnalyticsProperties(event.user_properties);
      event.event_properties = {
        ...scrubAnalyticsProperties(event.event_properties),
        ...analyticsContext({
          pathname: location.pathname,
          width: innerWidth,
          locale: document.documentElement.lang || navigator.language,
          native: isNativeApp(),
        }),
      };
      return event;
    },
  };
}
