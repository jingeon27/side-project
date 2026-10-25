import * as Sentry from '@sentry/nextjs';
import { afterEach, expect, it, vi } from 'vitest';

import { onRequestError, register } from './instrumentation';

const { envelopes } = vi.hoisted(() => ({ envelopes: [] as string[] }));
vi.mock('@sentry/nextjs', async () => {
  const { createRequire } = await import('node:module');
  const sdk = createRequire(import.meta.url)('@sentry/nextjs') as typeof import('@sentry/nextjs');
  return {
    ...sdk,
    init: (options: Parameters<typeof sdk.init>[0]) =>
      sdk.init({
        ...options,
        transport: () => ({
          send: async (envelope: unknown) => {
            envelopes.push(JSON.stringify(envelope));
            return { statusCode: 200 };
          },
          flush: async () => true,
        }),
      }),
  };
});

afterEach(async () => {
  await Sentry.close(1000);
  envelopes.length = 0;
  vi.unstubAllEnvs();
});

it('sends Next request errors through the real SDK with the shared release and no private request data', async () => {
  vi.stubEnv('NEXT_RUNTIME', 'nodejs');
  vi.stubEnv('NEXT_PHASE', '');
  vi.stubEnv('NODE_ENV', 'development');
  vi.stubEnv('ENVIRONMENT', 'test');
  vi.stubEnv('SENTRY_DSN', 'https://test@sentry.invalid/1');
  vi.stubEnv('SENTRY_RELEASE', 'next-server-release');
  await register();
  await onRequestError(
    new Error('private-error-value'),
    { path: '/test?token=private-token', method: 'GET', headers: { cookie: 'private-cookie' } },
    { routerKind: 'App Router', routePath: '/test', routeType: 'route', revalidateReason: undefined },
  );
  await Sentry.flush(1000);
  expect(envelopes).toHaveLength(1);
  expect(envelopes[0]).toContain('"environment":"test"');
  expect(envelopes[0]).toContain('"release":"next-server-release"');
  expect(envelopes[0]).toContain('"exception"');
  expect(envelopes[0]).not.toContain('private-');
});
