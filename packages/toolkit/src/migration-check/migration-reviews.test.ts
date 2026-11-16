import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it, vi } from 'vitest';

import { main, migrationReviews } from './check-migrations';
import { MIGRATIONS, withGitRepo } from './test/git-repo';

describe('릴리스에 포함된 기존 migration 검토 기록', () => {
  it('정확한 원문만 허용하고 변경·삭제·다른 경로의 SQL은 면제하지 않는다', () => {
    withGitRepo(({ cwd, put, commit, git }) => {
      const sql = 'CREATE UNIQUE INDEX p_key ON p(id);';
      put('reviewed', sql);
      const file = `${MIGRATIONS}/reviewed/migration.sql`;
      const reviews = {
        [file]: {
          sha256: createHash('sha256').update(sql).digest('hex'),
          reason: '기존 릴리스 이력의 인덱스를 검토했다.',
        },
      };
      commit('base');
      expect(migrationReviews({ cwd, reviews }).errors).toEqual([]);
      expect(migrationReviews({ cwd, reviews }).files.has(`${MIGRATIONS}/new/migration.sql`)).toBe(false);
      put('reviewed', `${sql}\n-- changed`);
      expect(migrationReviews({ cwd, reviews }).errors).toEqual([
        expect.stringContaining('reviewed migration.sql or its review was modified'),
      ]);
      git('rm', '-fq', file);
      expect(migrationReviews({ cwd, reviews }).errors).toEqual([
        expect.stringContaining('reviewed migration.sql is missing'),
      ]);
    });
  });

  it('main에 없는 과거 SQL이 검토됐어도 새 위험 migration은 릴리스 검사에서 거부한다', () => {
    const errors: string[] = [];
    vi.spyOn(console, 'error').mockImplementation((message: string) => errors.push(message));
    vi.spyOn(console, 'log').mockImplementation(() => undefined);
    try {
      withGitRepo(({ cwd, put, commit }) => {
        const base = commit('main');
        put('reviewed', 'CREATE UNIQUE INDEX p_key ON p(id);');
        const file = `${MIGRATIONS}/reviewed/migration.sql`;
        const reviews = {
          [file]: {
            sha256: createHash('sha256')
              .update(readFileSync(join(cwd, file)))
              .digest('hex'),
            reason: '기존 릴리스 이력의 인덱스를 검토했다.',
          },
        };
        commit('develop');
        main({ env: { MIGRATION_BASE_REF: base }, cwd, reviews });
        expect(process.exitCode).not.toBe(1);
        expect(errors).toEqual([]);
        put('new', 'DROP TABLE p;');
        commit('new');
        main({ env: { MIGRATION_BASE_REF: base }, cwd, reviews });
        expect(process.exitCode).toBe(1);
        expect(errors).toEqual([expect.stringContaining('new/migration.sql:1: DROP TABLE requires')]);
      });
    } finally {
      process.exitCode = undefined;
      vi.restoreAllMocks();
    }
  });
});
