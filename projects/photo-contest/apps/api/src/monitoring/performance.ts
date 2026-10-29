import { isEnabled, metrics, type Metric, type NodeOptions } from '@sentry/node';

type TSpan = Parameters<NonNullable<NodeOptions['beforeSendSpan']>>[0];
type TIntegration = Extract<NodeOptions['integrations'], unknown[]>[number];
const ROUTES = new Set([
  '/graphql',
  '/app/config',
  '/auth/logout',
  '/photos/:id',
  '/media/:id',
  '/media/:id/download',
  '/groups/:groupId/avatar/:avatarId',
  '/groups/:groupId/cover/:coverId',
  '/profiles/:userId/avatar/:avatarId',
  '/push/devices/register',
  '/push/devices/unregister',
  'unmatched',
]);
const METHODS = new Set(['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'HEAD', 'OPTIONS', 'OTHER']);
const OUTCOMES = new Set(['ok', 'client_error', 'server_error', 'aborted', 'rejected', 'failed']);
const GRAPHQL_TYPES = new Set(['query', 'mutation']);
const GRAPHQL_FIELDS = new Set<string>();
const SDK_ATTRIBUTES = new Set([
  'sentry.environment',
  'sentry.release',
  'sentry.sdk.name',
  'sentry.sdk.version',
]);
const METRICS = {
  'api.http.requests': 'counter',
  'api.http.duration': 'distribution',
  'api.graphql.fields': 'counter',
  'api.graphql.duration': 'distribution',
} satisfies Record<string, Metric['type']>;

/** 이름·alias·문서 대신 서버 스키마에 존재하는 최상위 필드만 차원으로 쓴다. */
export function registerGraphqlFields(fields: readonly string[]) {
  for (const field of fields) GRAPHQL_FIELDS.add(field);
}

export function performanceRoute(value: unknown) {
  return typeof value === 'string' && ROUTES.has(value) ? value : 'unmatched';
}

function methodOf(value: string) {
  return METHODS.has(value) ? value : 'OTHER';
}

function allowedAttribute(key: string, value: unknown) {
  if (SDK_ATTRIBUTES.has(key)) return typeof value === 'string';
  if (key === 'http.response.status_code')
    return typeof value === 'number' && Number.isInteger(value) && value >= 100 && value <= 599;
  if (typeof value !== 'string') return false;
  if (key === 'http.route') return ROUTES.has(value);
  if (key === 'http.request.method') return METHODS.has(value);
  if (key === 'outcome') return OUTCOMES.has(value);
  if (key === 'graphql.operation.type') return GRAPHQL_TYPES.has(value);
  return key === 'graphql.field' && GRAPHQL_FIELDS.has(value);
}

export function scrubPerformanceMetric(metric: Metric): Metric | null {
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
      service: 'photo-contest',
      layer: 'api',
    },
  };
}

export const performancePrivacyIntegration = {
  name: 'PhotoContestPerformancePrivacy',
  setup(client) {
    client.on('createDsc', (context) => {
      delete context.transaction;
    });
    // SDK 11은 beforeSendMetric 뒤에 scope 속성을 합치므로 최종 envelope도 정리한다.
    client.on('beforeEnvelope', (envelope) => {
      for (const [header, payload] of envelope[1]) {
        if (
          header.type !== 'trace_metric' ||
          typeof payload !== 'object' ||
          !payload ||
          !('items' in payload) ||
          !Array.isArray(payload.items)
        )
          continue;
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
                return allowedAttribute(key, value)
                  ? [[key, { type: typeof value === 'number' ? 'integer' : 'string', value }]]
                  : [];
              }),
            ),
            service: { type: 'string', value: 'photo-contest' },
            layer: { type: 'string', value: 'api' },
          };
        }
      }
    });
  },
} satisfies TIntegration;

export function scrubPerformanceSpan(span: TSpan): TSpan {
  const http = span.attributes['sentry.op'] === 'http.server';
  const route = performanceRoute(span.attributes['http.route']);
  const method =
    typeof span.attributes['http.request.method'] === 'string'
      ? methodOf(span.attributes['http.request.method'])
      : 'OTHER';
  const field = span.attributes['graphql.field'];
  const kind = span.attributes['graphql.operation.type'];
  const graphql =
    typeof field === 'string' &&
    GRAPHQL_FIELDS.has(field) &&
    typeof kind === 'string' &&
    GRAPHQL_TYPES.has(kind);
  const name = http ? `${method} ${route}` : graphql ? `${kind} ${field}` : 'api.operation';
  const op = http ? 'http.server' : graphql ? 'graphql.resolve' : 'function';
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
      ...Object.fromEntries(
        Object.entries(span.attributes).filter(([key, value]) => allowedAttribute(key, value)),
      ),
      'sentry.op': op,
      'sentry.segment.name': http ? name : 'api.operation',
      service: 'photo-contest',
      layer: 'api',
    },
  };
}

function httpOutcome(status: number, aborted: boolean) {
  if (aborted) return 'aborted';
  if (status >= 500) return 'server_error';
  if (status >= 400) return 'client_error';
  return 'ok';
}

export function recordHttpPerformance(
  route: string,
  method: string,
  status: number,
  duration: number,
  aborted: boolean,
) {
  if (!isEnabled()) return;
  const attributes = {
    'http.route': performanceRoute(route),
    'http.request.method': methodOf(method),
    'http.response.status_code': status,
    outcome: httpOutcome(status, aborted),
  };
  metrics.count('api.http.requests', 1, { attributes });
  metrics.distribution('api.http.duration', duration, { unit: 'millisecond', attributes });
}

export function recordGraphqlPerformance(
  field: string,
  kind: string,
  duration: number,
  outcome: 'ok' | 'rejected' | 'failed',
) {
  if (!isEnabled()) return;
  const attributes = { 'graphql.field': field, 'graphql.operation.type': kind, outcome };
  metrics.count('api.graphql.fields', 1, { attributes });
  metrics.distribution('api.graphql.duration', duration, { unit: 'millisecond', attributes });
}
