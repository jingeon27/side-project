import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { prepareE2eDatabase } from './e2e';

const TEST_URL = 'postgresql://contest:contest@127.0.0.1:55434/photo_contest_test?schema=public';

beforeEach(() => {
  vi.stubEnv('TEST_DATABASE_URL', TEST_URL);
  vi.stubEnv('LOCAL_TEST_POSTGRES_PORT', '55434');
  vi.stubEnv('LOCAL_POSTGRES_PORT', '55432');
  vi.stubEnv('PC_E2E_SCHEMA', undefined);
  vi.stubEnv('PC_E2E_BASE_DATABASE_URL', undefined);
  vi.stubEnv('PC_E2E_DATABASE_URL', undefined);
});
afterEach(() => vi.unstubAllEnvs());

describe('prepareE2eDatabase', () => {
  it('레인 접두사의 새 격리 스키마를 만들어 워커가 같은 값을 쓰게 해야 한다', () => {
    const database = prepareE2eDatabase('web_e2e');
    expect(database.schema).toMatch(/^web_e2e_[0-9a-f]{32}$/);
    expect(process.env.PC_E2E_SCHEMA).toBe(database.schema);
    expect(prepareE2eDatabase('web_e2e').schema).toBe(database.schema);
  });

  it.each(['public', `mobile_e2e_${'a'.repeat(32)}`, 'web_e2e_manual'])(
    '밖에서 넣은 PC_E2E_SCHEMA=%s는 거부해야 한다',
    (schema) => {
      vi.stubEnv('PC_E2E_SCHEMA', schema);
      expect(() => prepareE2eDatabase('web_e2e')).toThrow('격리 스키마');
    },
  );

  it('밖에서 넣은 기준 DB URL도 테스트 DB 규칙으로 검사해야 한다', () => {
    vi.stubEnv(
      'PC_E2E_BASE_DATABASE_URL',
      'postgresql://contest:contest@127.0.0.1:55432/photo_contest?schema=public',
    );
    expect(() => prepareE2eDatabase('web_e2e')).toThrow('전용 포트');
  });
});
