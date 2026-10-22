import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { checkMigration, migrationBase, newlyAddedMigrations } from './check-migrations.mjs';

describe('배포 호환 migration 검사', () => {
  it.each([
    ['DROP TABLE "Post";', 'DROP TABLE'],
    ['ALTER TABLE "Post" DROP COLUMN "old";', 'DROP COLUMN'],
    ['ALTER TABLE "Post" DROP "old";', 'DROP COLUMN'],
    ['ALTER TABLE "Post" ALTER COLUMN "body" TYPE text;', 'ALTER COLUMN TYPE'],
    ['ALTER TABLE p ALTER c SET DATA TYPE text;', 'ALTER COLUMN TYPE'],
    ['ALTER TABLE p ALTER COLUMN x SET NOT NULL;', 'SET NOT NULL'],
    ['ALTER TABLE p ALTER COLUMN x DROP NOT NULL;', 'DROP NOT NULL'],
    ['ALTER TABLE p RENAME COLUMN a TO b;', 'RENAME'],
    ['ALTER TABLE p DROP CONSTRAINT c;', 'DROP CONSTRAINT'],
    ['DROP INDEX idx;', 'DROP INDEX'],
  ])('%s를 차단한다', (sql, rule) => expect(checkMigration(sql).map((error) => error.rule)).toContain(rule));
  it('문자열·주석·식별자와 함수 본문은 DDL로 오인하지 않는다', () => {
    expect(
      checkMigration(
        `-- DROP TABLE x;\nCREATE TABLE "RENAME" (id text, description text DEFAULT 'DROP COLUMN x');\n/* outer /* nested */ DROP INDEX idx; */\nDO $body$ BEGIN RAISE NOTICE 'DROP NOT NULL'; END $body$;`,
      ),
    ).toEqual([]);
  });
  it('바로 앞의 구체적인 사유만 같은 규칙 한 번에 적용한다', () => {
    expect(
      checkMigration(
        '-- migration-lint: allow DROP COLUMN — old readers retired for two weeks\nALTER TABLE p DROP COLUMN old;',
      ),
    ).toEqual([]);
    expect(
      checkMigration(
        '-- migration-lint: allow DROP COLUMN — old readers retired\n\nALTER TABLE p DROP COLUMN old;',
      ),
    ).toHaveLength(1);
    expect(
      checkMigration(
        '-- migration-lint: allow DROP TABLE — old readers retired\nALTER TABLE p DROP COLUMN old;',
      ),
    ).toHaveLength(1);
  });
  it('기존 SQL 수정·기존 위험한 SQL을 제외하고 새 migration만 고른다', () => {
    const cwd = mkdtempSync(join(tmpdir(), 'migration-check-'));
    const git = (...args: string[]) => execFileSync('git', args, { cwd, encoding: 'utf8' });
    const root = 'projects/game-feedback/apps/api/prisma/migrations';
    const put = (name: string, sql: string) => {
      mkdirSync(join(cwd, root, name), { recursive: true });
      writeFileSync(join(cwd, root, name, 'migration.sql'), sql);
    };
    try {
      git('init', '-q');
      git('config', 'user.name', 'Test');
      git('config', 'user.email', 'test@example.invalid');
      put('old', 'DROP TABLE old;');
      git('add', '.');
      git('commit', '-qm', 'base');
      const base = git('rev-parse', 'HEAD').trim();
      put('old', 'DROP TABLE old; -- changed');
      put('new', 'CREATE TABLE new(id text);');
      git('add', '.');
      git('commit', '-qm', 'next');
      expect(newlyAddedMigrations({ base, cwd })).toEqual([`${root}/new/migration.sql`]);
    } finally {
      rmSync(cwd, { recursive: true, force: true });
    }
  });
  it('강제 push로 HEAD의 조상이 아닌 before는 develop 기준으로 바꾼다', () => {
    const cwd = mkdtempSync(join(tmpdir(), 'migration-base-'));
    const git = (...args: string[]) => execFileSync('git', args, { cwd, encoding: 'utf8' }).trim();
    const commit = (file: string) => {
      writeFileSync(join(cwd, file), file);
      git('add', file);
      git('commit', '-qm', file);
      return git('rev-parse', 'HEAD');
    };
    try {
      git('init', '-q', '-b', 'develop');
      git('config', 'user.name', 'Test');
      git('config', 'user.email', 'test@example.invalid');
      commit('base');
      git('checkout', '-qb', 'feature');
      const previousTip = commit('feature-old');
      git('checkout', '-q', 'develop');
      commit('develop-migration');
      git('checkout', '-qB', 'feature');
      const tip = commit('feature-rebased');
      expect(migrationBase({ requested: previousTip, fallback: 'develop', cwd })).toBe('develop');
      expect(migrationBase({ requested: 'f'.repeat(40), fallback: 'develop', cwd })).toBe('develop');
      expect(migrationBase({ requested: '0'.repeat(40), fallback: 'develop', cwd })).toBe('develop');
      commit('feature-next');
      expect(migrationBase({ requested: tip, fallback: 'develop', cwd })).toBe(tip);
    } finally {
      rmSync(cwd, { recursive: true, force: true });
    }
  });
});
