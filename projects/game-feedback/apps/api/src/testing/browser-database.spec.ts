import { afterEach, describe, expect, it, vi } from 'vitest';

import { prepareBrowserDatabase } from './browser-database';

afterEach(() => vi.unstubAllEnvs());

describe('browser database isolation', () => {
  it('uses a dedicated test database when the parent has a development URL', () => {
    vi.stubEnv('DATABASE_URL', 'postgresql://game_feedback:local@127.0.0.1:55442/game_feedback');
    const { schema, databaseUrl } = prepareBrowserDatabase('web');
    expect(databaseUrl.port).toBe('55444');
    expect(databaseUrl.pathname).toBe('/game_feedback_test');
    expect(schema).toMatch(/^gf_test_web_[a-f0-9]{32}$/);
    expect(prepareBrowserDatabase('web').schema).toBe(schema);
  });
  it.each(['gf_test_mobile_' + 'a'.repeat(32), 'gf_test_manual', 'public_data'])(
    'rejects a schema owned by another run: %s',
    (schema) => {
      vi.stubEnv(
        'DATABASE_URL',
        `postgresql://game_feedback:local@127.0.0.1:55444/game_feedback_test?schema=${schema}`,
      );
      expect(() => prepareBrowserDatabase('web')).toThrow('owned schema');
    },
  );
});
