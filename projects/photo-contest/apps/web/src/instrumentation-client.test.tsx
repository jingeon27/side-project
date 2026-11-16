import { afterEach, expect, it, vi } from 'vitest';

const { initialize } = vi.hoisted(() => ({ initialize: vi.fn() }));

vi.mock('@sentry/nextjs', () => ({
  init: initialize,
  browserTracingIntegration: () => ({ name: 'BrowserTracing' }),
  captureRouterTransitionStart: vi.fn(),
}));

afterEach(() => {
  vi.unstubAllEnvs();
  vi.resetModules();
  initialize.mockClear();
});

it('브라우저 오류도 빌드에 지정한 release로 수집해야 한다', async () => {
  vi.stubEnv('NEXT_PUBLIC_SENTRY_DSN', 'https://test@sentry.invalid/1');
  vi.stubEnv('SENTRY_RELEASE', 'photo-release-test');

  await import('./instrumentation-client');

  expect(initialize).toHaveBeenCalledWith(expect.objectContaining({ release: 'photo-release-test' }));
});

it('release가 있어도 DSN이 없으면 수집을 시작하지 않아야 한다', async () => {
  vi.stubEnv('NEXT_PUBLIC_SENTRY_DSN', '');
  vi.stubEnv('SENTRY_RELEASE', 'photo-release-test');

  await import('./instrumentation-client');

  expect(initialize).not.toHaveBeenCalled();
});
