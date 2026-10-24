import { afterEach, describe, expect, it, vi } from 'vitest';

import { register } from './instrumentation';

vi.mock('@sentry/nextjs', () => ({ init: vi.fn(), captureRequestError: vi.fn() }));

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('server startup', () => {
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
