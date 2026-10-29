import { afterEach, describe, expect, it, vi } from 'vitest';

import { authCookieOptions, sessionCookieName } from './auth-cookie';

describe('인증 쿠키 이름', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('운영(https)에서는 __Host- 접두사와 Secure·Path=/를 함께 써야 한다', () => {
    vi.stubEnv('NODE_ENV', 'production');
    expect(sessionCookieName()).toBe('__Host-contest_session');
    expect(authCookieOptions()).toMatchObject({ secure: true, path: '/' });
    expect(authCookieOptions()).not.toHaveProperty('domain');
  });

  it('개발·테스트(http)에서는 Secure를 쓸 수 없으므로 기존 이름을 써야 한다', () => {
    for (const env of ['development', 'test']) {
      vi.stubEnv('NODE_ENV', env);
      expect(sessionCookieName()).toBe('contest_session');
      expect(authCookieOptions().secure).toBe(false);
    }
  });
});
