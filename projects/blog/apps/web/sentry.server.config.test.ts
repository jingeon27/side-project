import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const sdk = vi.hoisted(() => ({
  init: vi.fn<(options: Record<string, unknown>) => void>(),
  captureRouterTransitionStart: vi.fn(),
}));

vi.mock('@sentry/nextjs', () => sdk);

const runtimes = [['server', () => import('./sentry.server.config')]] as const;

beforeEach(() => {
  vi.resetModules();
  sdk.init.mockClear();
  vi.stubEnv('SENTRY_DSN', '');
  vi.stubEnv('NEXT_PUBLIC_SENTRY_DSN', '');
});

afterEach(vi.unstubAllEnvs);

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
