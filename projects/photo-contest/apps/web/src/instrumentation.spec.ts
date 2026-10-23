import { afterEach, describe, expect, it, vi } from 'vitest';

import { register } from './instrumentation';

vi.mock('@sentry/nextjs', () => ({ init: vi.fn(), captureRequestError: vi.fn() }));

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('register', () => {
  it('운영 Node 서버에서 앱 링크 값이 없으면 시작을 멈춰야 한다', () => {
    vi.stubEnv('NEXT_RUNTIME', 'nodejs');
    vi.stubEnv('NODE_ENV', 'production');
    vi.stubEnv('MOBILE_APPLE_TEAM_ID', '');
    vi.stubEnv('SENTRY_DSN', '');
    expect(() => register()).toThrow(/MOBILE_APPLE_TEAM_ID/);
  });

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
