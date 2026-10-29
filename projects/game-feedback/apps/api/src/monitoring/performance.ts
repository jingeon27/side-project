import type { NodeOptions } from '@sentry/node';

type TPerformanceSpan = Parameters<NonNullable<NodeOptions['beforeSendSpan']>>[0];
type TIntegration = Extract<NodeOptions['integrations'], unknown[]>[number];

const CHAT_OPERATIONS = {
  'chat.persist': 'db.transaction',
  'chat.insert': 'db.query',
  'chat.publish': 'messaging.publish',
} satisfies Record<string, string>;
const NUMERIC_ATTRIBUTES = new Set([
  'http.response.status_code',
  'chat.publish.recipients',
  'chat.publish.sent',
  'chat.publish.unavailable',
  'chat.publish.denied',
  'chat.publish.failed',
]);
const SDK_ATTRIBUTES = new Set([
  'sentry.origin',
  'sentry.segment.id',
  'sentry.sdk.name',
  'sentry.sdk.version',
  'sentry.release',
  'sentry.environment',
  'sentry.trace_lifecycle',
  'sentry.sample_rate',
]);
const HTTP_METHODS = new Set(['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'HEAD', 'OPTIONS']);

/** Envelope sampling metadata bypasses beforeSendSpan and can otherwise retain the original name. */
export const performancePrivacyIntegration = {
  name: 'GameFeedbackPerformancePrivacy',
  setup(client) {
    client.on('createDsc', (context) => {
      delete context.transaction;
    });
  },
} satisfies TIntegration;

/** Accept only framework route templates, never request URLs or query strings. */
export function performanceRoute(value: unknown): string {
  return typeof value === 'string' &&
    value.length <= 200 &&
    /^\/api(?:\/(?:[a-z][a-z-]*|:[a-zA-Z][a-zA-Z0-9]*))*\/?$/.test(value)
    ? value
    : 'unmatched';
}

export function performanceMethod(value: unknown): string {
  return typeof value === 'string' && HTTP_METHODS.has(value) ? value : 'OTHER';
}

/** Error beforeSend does not run for streamed spans. Keep only bounded operations and measurements. */
export function scrubPerformanceSpan(span: TPerformanceSpan): TPerformanceSpan {
  const http = span.attributes['sentry.op'] === 'http.server';
  const route = performanceRoute(span.attributes['http.route']);
  const method = performanceMethod(span.attributes['http.request.method']);
  const chatOperation = Object.entries(CHAT_OPERATIONS).find(([name]) => name === span.name);
  const name = http ? `${method} ${route}` : (chatOperation?.[0] ?? 'api.operation');
  const op = http ? 'http.server' : (chatOperation?.[1] ?? 'function');
  const attributes = Object.fromEntries(
    Object.entries(span.attributes).filter(([key, value]) => {
      if (SDK_ATTRIBUTES.has(key)) return typeof value === 'string' || typeof value === 'number';
      if (NUMERIC_ATTRIBUTES.has(key)) return typeof value === 'number' && Number.isFinite(value);
      return key === 'http.response.aborted' && typeof value === 'boolean';
    }),
  );
  return {
    trace_id: span.trace_id,
    parent_span_id: span.parent_span_id,
    span_id: span.span_id,
    start_timestamp: span.start_timestamp,
    end_timestamp: span.end_timestamp,
    status: span.status,
    is_segment: span.is_segment,
    name,
    attributes: {
      ...attributes,
      'sentry.op': op,
      'sentry.segment.name': http ? name : 'api.operation',
      service: 'game-feedback',
      layer: 'api',
      ...(http ? { 'http.route': route, 'http.request.method': method } : {}),
    },
  };
}
