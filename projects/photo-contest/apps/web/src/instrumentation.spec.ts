import { afterEach, describe, expect, it, vi } from 'vitest';

import { register } from './instrumentation';

vi.mock('@sentry/nextjs', () => ({ init: vi.fn(), captureRequestError: vi.fn() }));

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('register', () => {
  it('개발 서버는 자리표시자로 시작하고 Edge 런타임은 검사하지 않아야 한다', () => {
    vi.stubEnv('NEXT_RUNTIME', 'nodejs');
    vi.stubEnv('NODE_ENV', 'development');
    vi.stubEnv('SENTRY_DSN', '');
    expect(() => register()).not.toThrow();
    vi.stubEnv('NEXT_RUNTIME', 'edge');
    vi.stubEnv('NODE_ENV', 'production');
    expect(() => register()).not.toThrow();
  });
});
