import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const sdk = vi.hoisted(() => ({
  init: vi.fn<(options: Record<string, unknown>) => void>(),
  captureRouterTransitionStart: vi.fn(),
}));
vi.mock('@sentry/nextjs', () => sdk);

const runtimes = [
  ['server', () => import('../../sentry.server.config')],
  ['edge', () => import('../../sentry.edge.config')],
  ['client', () => import('../../src/instrumentation-client')],
] as const;

beforeEach(() => {
  vi.resetModules();
  sdk.init.mockClear();
  vi.stubEnv('SENTRY_DSN', '');
  vi.stubEnv('NEXT_PUBLIC_SENTRY_DSN', '');
});
afterEach(() => vi.unstubAllEnvs());

describe.each(runtimes)('Sentry %s configuration', (_runtime, load) => {
  it('does not initialize without a DSN', async () => {
    await load();
    expect(sdk.init).not.toHaveBeenCalled();
  });

  it('passes explicit collection denials and active streaming filters to the SDK', async () => {
    vi.stubEnv('SENTRY_DSN', 'https://server@example.com/1');
    vi.stubEnv('NEXT_PUBLIC_SENTRY_DSN', 'https://browser@example.com/1');
    await load();
    await vi.waitFor(() => expect(sdk.init).toHaveBeenCalledOnce());
    const options = sdk.init.mock.calls[0]![0];
    expect(options.dataCollection).toEqual({
      userInfo: false,
      cookies: false,
      httpHeaders: { request: false, response: false },
      httpBodies: [],
      urlQueryParams: false,
      genAI: { inputs: false, outputs: false },
      databaseQueryData: false,
      queues: false,
      graphQL: { document: false, variables: false },
      stackFrameVariables: false,
      frameContextLines: 0,
    });
    expect(options.traceLifecycle).toBe('stream');
    expect(options.beforeSend).toEqual(expect.any(Function));
    expect(options.beforeSendSpan).toEqual(expect.any(Function));
    expect(options.beforeBreadcrumb).toEqual(expect.any(Function));
    expect(options).not.toHaveProperty('sendDefaultPii');
    expect(options).not.toHaveProperty('beforeSendTransaction');
  });
});

it('scrubs streamed span names, attributes and linked attributes without breaking trace identity', async () => {
  const { scrubSentrySpan } = await import('@/shared/lib/analytics/sentry');
  const span = {
    trace_id: 'a'.repeat(32),
    span_id: 'b'.repeat(16),
    is_segment: true,
    name: 'GET https://blog.example/ko/blog?search=private#anchor',
    start_timestamp: 1,
    end_timestamp: 2,
    status: 'ok',
    attributes: {
      'url.full': 'https://blog.example/ko/blog?search=private#anchor',
      'user.id': 'private',
      'http.request.header.authorization': 'Bearer private',
      'http.response.body': 'private',
      'gen_ai.input.messages': 'private',
      'db.query.text': 'SELECT private',
      'graphql.variables': 'private',
      'app.category': 'engineering',
    },
    links: [
      {
        trace_id: 'c'.repeat(32),
        span_id: 'd'.repeat(16),
        attributes: { 'user.email': 'hello@example.com', 'sentry.op': 'navigation' },
      },
    ],
  };
  const safe = scrubSentrySpan(span);
  expect(safe.trace_id).toBe(span.trace_id);
  expect(safe.span_id).toBe(span.span_id);
  expect(safe.name).toBe('GET https://blog.example/ko/blog');
  expect(safe.attributes).toEqual({
    'url.full': 'https://blog.example/ko/blog',
    'app.category': 'engineering',
  });
  expect(safe.links[0]?.attributes).toEqual({ 'sentry.op': 'navigation' });
  expect(JSON.stringify(safe)).not.toContain('private');
  expect(span.attributes['user.id']).toBe('private');
});
