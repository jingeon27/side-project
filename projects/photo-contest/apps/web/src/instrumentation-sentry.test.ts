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

it('Next 서버 오류도 실제 SDK에서 원문·요청 없이 서비스와 실행 위치를 기록해야 한다', async () => {
  vi.stubEnv('NEXT_RUNTIME', 'nodejs');
  vi.stubEnv('NEXT_PHASE', '');
  vi.stubEnv('NODE_ENV', 'test');
  vi.stubEnv('SENTRY_DSN', 'https://test@sentry.invalid/1');
  register();
  await onRequestError(
    new Error('private-error-message'),
    { path: '/invite/private-token?q=private-query', method: 'GET', headers: { cookie: 'private-cookie' } },
    {
      routerKind: 'App Router',
      routePath: '/invite/[token]',
      routeType: 'route',
    },
  );
  await Sentry.flush(1000);
  expect(envelopes).toHaveLength(1);
  expect(envelopes[0]).not.toContain('private-');
  expect(envelopes[0]).toContain('"service":"photo-contest"');
  expect(envelopes[0]).toContain('"layer":"next-server"');
  expect(envelopes[0]).toContain('"exception"');
});
