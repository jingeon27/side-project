import { init } from '@sentry/nextjs';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { register } from './instrumentation';

vi.mock('@sentry/nextjs', () => ({ init: vi.fn(), captureRequestError: vi.fn() }));

afterEach(() => {
  vi.unstubAllEnvs();
  vi.clearAllMocks();
});

describe('server startup', () => {
  it('uses the shared environment and release when initializing Next server errors', async () => {
    vi.stubEnv('NEXT_RUNTIME', 'nodejs');
    vi.stubEnv('NEXT_PHASE', '');
    vi.stubEnv('NODE_ENV', 'development');
    vi.stubEnv('ENVIRONMENT', 'test');
    vi.stubEnv('SENTRY_DSN', 'https://test@sentry.invalid/1');
    vi.stubEnv('SENTRY_RELEASE', 'runtime-release');
    vi.stubEnv('NEXT_PUBLIC_SENTRY_RELEASE', 'build-release');
    await register();
    expect(init).toHaveBeenLastCalledWith(
      expect.objectContaining({ environment: 'test', release: 'runtime-release' }),
    );
    vi.stubEnv('SENTRY_RELEASE', '');
    await register();
    expect(init).toHaveBeenLastCalledWith(expect.objectContaining({ release: 'build-release' }));
  });
  it('stops a production Node server whose App Link values are missing', async () => {
    vi.stubEnv('NEXT_RUNTIME', 'nodejs');
    vi.stubEnv('NEXT_PHASE', '');
    vi.stubEnv('NODE_ENV', 'production');
    vi.stubEnv('MOBILE_APPLE_TEAM_ID', '');
    vi.stubEnv('SENTRY_DSN', '');
    vi.stubEnv('NEXT_PUBLIC_SENTRY_DSN', '');
    await expect(register()).rejects.toThrow(/MOBILE_APPLE_TEAM_ID/);
  });

  it('skips the check while building and on the edge runtime, and starts development with placeholders', async () => {
    vi.stubEnv('SENTRY_DSN', '');
    vi.stubEnv('NEXT_PUBLIC_SENTRY_DSN', '');
    vi.stubEnv('NODE_ENV', 'production');
    vi.stubEnv('NEXT_RUNTIME', 'nodejs');
    vi.stubEnv('NEXT_PHASE', 'phase-production-build');
    await expect(register()).resolves.toBeUndefined();
    vi.stubEnv('NEXT_PHASE', '');
    vi.stubEnv('NEXT_RUNTIME', 'edge');
    await expect(register()).resolves.toBeUndefined();
    vi.stubEnv('NEXT_RUNTIME', 'nodejs');
    vi.stubEnv('NODE_ENV', 'development');
    await expect(register()).resolves.toBeUndefined();
  });
});
