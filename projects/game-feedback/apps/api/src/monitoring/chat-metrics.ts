import { isEnabled, metrics, startSpan, type Metric, type NodeOptions, type Span } from '@sentry/node';

import { ApiError } from '../common/http/api-error';
import { CHAT_OPERATIONS, performanceMethod } from './performance';

type TChatOperation = keyof typeof CHAT_OPERATIONS;
type TIntegration = Extract<NodeOptions['integrations'], unknown[]>[number];
export type TPublishOutcome = 'sent' | 'unavailable' | 'denied' | 'failed';
export type TStreamCloseReason =
  | 'client_disconnect'
  | 'session_invalid'
  | 'session_limit'
  | 'user_limit'
  | 'session_closed'
  | 'user_closed'
  | 'server_shutdown'
  | 'heartbeat_failed'
  | 'delivery_failed';

const METRICS = {
  'chat.http.requests': 'counter',
  'chat.http.duration': 'distribution',
  'chat.operation.duration': 'distribution',
  'chat.operation.failures': 'counter',
  'chat.send.results': 'counter',
  'chat.publish.deliveries': 'counter',
  'chat.publish.recipients': 'distribution',
  'chat.sse.opened': 'counter',
  'chat.sse.closed': 'counter',
  'chat.sse.active': 'gauge',
  'chat.sse.connection.duration': 'distribution',
} satisfies Record<string, Metric['type']>;

const ATTRIBUTE_VALUES = {
  operation: new Set(Object.keys(CHAT_OPERATIONS)),
  outcome: new Set(['ok', 'client_error', 'server_error', 'aborted', 'rejected', 'failed']),
  result: new Set(['created', 'duplicate', 'sent', 'unavailable', 'denied', 'failed']),
  reason: new Set<TStreamCloseReason>([
    'client_disconnect',
    'session_invalid',
    'session_limit',
    'user_limit',
    'session_closed',
    'user_closed',
    'server_shutdown',
    'heartbeat_failed',
    'delivery_failed',
  ]),
  'http.route': new Set([
    '/api/conversations',
    '/api/conversations/:id/messages',
    '/api/conversations/:id/read',
    'unmatched',
  ]),
  'http.request.method': new Set(['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'HEAD', 'OPTIONS', 'OTHER']),
} satisfies Record<string, ReadonlySet<string>>;
const SDK_ATTRIBUTES = new Set([
  'sentry.environment',
  'sentry.release',
  'sentry.sdk.name',
  'sentry.sdk.version',
]);

function allowedAttribute(key: string, value: unknown) {
  if (SDK_ATTRIBUTES.has(key)) return typeof value === 'string';
  if (key === 'http.response.status_code')
    return typeof value === 'number' && Number.isInteger(value) && value >= 100 && value <= 599;
  const allowed: ReadonlySet<string> | undefined = Object.entries(ATTRIBUTE_VALUES).find(
    ([name]) => name === key,
  )?.[1];
  return typeof value === 'string' && !!allowed?.has(value);
}

/** Only bounded metric names, numeric values and known dimensions leave this process. */
export function scrubChatMetric(metric: Metric): Metric | null {
  const definition = Object.entries(METRICS).find(([name]) => name === metric.name);
  if (!definition || definition[1] !== metric.type || !Number.isFinite(metric.value) || metric.value < 0)
    return null;
  return {
    name: metric.name,
    type: metric.type,
    value: metric.value,
    ...(metric.name.endsWith('.duration') ? { unit: 'millisecond' } : {}),
    attributes: {
      ...Object.fromEntries(
        Object.entries(metric.attributes ?? {}).filter(([key, value]) => allowedAttribute(key, value)),
      ),
      service: 'game-feedback',
      layer: 'api',
    },
  };
}

/** SDK 11 merges scope attributes after beforeSendMetric; scrub the final serialized attributes too. */
export const chatMetricsPrivacyIntegration = {
  name: 'GameFeedbackChatMetricsPrivacy',
  setup(client) {
    client.on('beforeEnvelope', (envelope) => {
      for (const [header, payload] of envelope[1]) {
        if (
          header.type !== 'trace_metric' ||
          typeof payload !== 'object' ||
          !payload ||
          !('items' in payload)
        )
          continue;
        if (!Array.isArray(payload.items)) continue;
        const items: unknown[] = payload.items;
        for (const item of items) {
          if (typeof item !== 'object' || !item || !('attributes' in item)) continue;
          const attributes: unknown = item.attributes;
          const entries = attributes && typeof attributes === 'object' ? Object.entries(attributes) : [];
          item.attributes = {
            ...Object.fromEntries(
              entries.flatMap(([key, attribute]: [string, unknown]) => {
                if (typeof attribute !== 'object' || !attribute || !('value' in attribute)) return [];
                const value: unknown = attribute.value;
                if (!allowedAttribute(key, value)) return [];
                return [[key, { type: typeof value === 'number' ? 'integer' : 'string', value }]];
              }),
            ),
            service: { type: 'string', value: 'game-feedback' },
            layer: { type: 'string', value: 'api' },
          };
        }
      }
    });
  },
} satisfies TIntegration;

/** Route classification also works for requests rejected before Nest selects a handler. */
export function chatHttpRoute(path: string) {
  if (/^\/api\/conversations\/?$/.test(path)) return '/api/conversations';
  if (/^\/api\/conversations\/[^/]+\/messages\/?$/.test(path)) return '/api/conversations/:id/messages';
  if (/^\/api\/conversations\/[^/]+\/read\/?$/.test(path)) return '/api/conversations/:id/read';
  return undefined;
}

export function recordChatHttp(
  route: string,
  method: string,
  status: number,
  duration: number,
  aborted: boolean,
) {
  if (!isEnabled()) return;
  const outcome = httpOutcome(status, aborted);
  const attributes = {
    'http.route': route,
    'http.request.method': performanceMethod(method),
    'http.response.status_code': status,
    outcome,
  };
  metrics.count('chat.http.requests', 1, { attributes });
  metrics.distribution('chat.http.duration', duration, { unit: 'millisecond', attributes });
}

function httpOutcome(status: number, aborted: boolean) {
  if (aborted) return 'aborted';
  if (status >= 500) return 'server_error';
  if (status >= 400) return 'client_error';
  return 'ok';
}

/** Metrics are independent of trace sampling; the original operation result/error is preserved. */
export function measureChatOperation<T>(
  operation: TChatOperation,
  run: (span: Span) => Promise<T>,
): Promise<T> {
  return startSpan({ name: operation, op: CHAT_OPERATIONS[operation] }, async (span) => {
    const started = performance.now();
    try {
      return await run(span);
    } catch (error) {
      if (isEnabled())
        metrics.count('chat.operation.failures', 1, {
          attributes: {
            operation,
            outcome: error instanceof ApiError && error.getStatus() < 500 ? 'rejected' : 'failed',
          },
        });
      throw error;
    } finally {
      if (isEnabled())
        metrics.distribution('chat.operation.duration', performance.now() - started, {
          unit: 'millisecond',
          attributes: { operation },
        });
    }
  });
}

export function recordChatSend(result: 'created' | 'duplicate') {
  if (isEnabled()) metrics.count('chat.send.results', 1, { attributes: { result } });
}

export function recordChatPublish(outcomes: Partial<Record<TPublishOutcome, number>>, recipients: number) {
  if (!isEnabled()) return;
  metrics.distribution('chat.publish.recipients', recipients);
  for (const [result, count] of Object.entries(outcomes))
    if (count) metrics.count('chat.publish.deliveries', count, { attributes: { result } });
}

export function recordChatConnections(active: number) {
  if (isEnabled()) metrics.gauge('chat.sse.active', active);
}

export function recordChatStreamOpened(active: number) {
  if (isEnabled()) metrics.count('chat.sse.opened', 1);
  recordChatConnections(active);
}

export function recordChatStreamClosed(reason: TStreamCloseReason, duration: number, active: number) {
  if (isEnabled()) {
    metrics.count('chat.sse.closed', 1, { attributes: { reason } });
    metrics.distribution('chat.sse.connection.duration', duration, {
      unit: 'millisecond',
      attributes: { reason },
    });
  }
  recordChatConnections(active);
}
