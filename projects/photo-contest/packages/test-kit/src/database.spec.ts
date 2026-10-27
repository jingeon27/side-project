import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { assertTestDatabaseUrl } from './database';

// Playwright 컨테이너 job에서는 같은 job의 서비스 컨테이너 이름(postgres)과 컨테이너 포트로 테스트 DB에 닿는다.
const SERVICE_URL = 'postgresql://contest:contest@postgres:5432/photo_contest_test?schema=public';

beforeEach(() => {
  vi.stubEnv('LOCAL_TEST_POSTGRES_PORT', '5432');
  vi.stubEnv('LOCAL_POSTGRES_PORT', undefined);
});
afterEach(() => vi.unstubAllEnvs());

describe('GitHub Actions 컨테이너 job의 테스트 DB', () => {
  it('GitHub Actions에서는 서비스 컨테이너 postgres를 허용해야 한다', () => {
    vi.stubEnv('GITHUB_ACTIONS', 'true');
    expect(assertTestDatabaseUrl(SERVICE_URL)).toBe(SERVICE_URL);
  });

  it('GitHub Actions 밖에서는 postgres 호스트를 거부해야 한다', () => {
    vi.stubEnv('GITHUB_ACTIONS', undefined);
    expect(() => assertTestDatabaseUrl(SERVICE_URL)).toThrow('loopback');
  });

  it.each(['db.example.com', 'postgres.example.com', 'postgres-prod'])(
    'GitHub Actions에서도 다른 호스트 %s는 거부해야 한다',
    (host) => {
      vi.stubEnv('GITHUB_ACTIONS', 'true');
      expect(() => assertTestDatabaseUrl(SERVICE_URL.replace('@postgres:', `@${host}:`))).toThrow('loopback');
    },
  );

  it('GitHub Actions에서도 전용 포트와 테스트 DB 이름만 허용해야 한다', () => {
    vi.stubEnv('GITHUB_ACTIONS', 'true');
    expect(() => assertTestDatabaseUrl(SERVICE_URL.replace(':5432/', ':5433/'))).toThrow('5432');
    expect(() =>
      assertTestDatabaseUrl(SERVICE_URL.replace('/photo_contest_test?', '/photo_contest?')),
    ).toThrow('photo_contest_test');
  });
});
