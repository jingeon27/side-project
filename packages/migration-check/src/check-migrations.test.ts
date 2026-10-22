import { describe, expect, it } from 'vitest';

import { checkMigration, migrationBase, migrationChanges } from './check-migrations.mjs';
import { MIGRATIONS, withGitRepo } from './test/git-repo';

const rules = (sql: string) => checkMigration(sql).map((error) => error.rule);

// 2026-10-22 develop 감사에서 통과해 버린 SQL과 잘못 붙은 규칙명.
describe('감사에서 재현한 migration 검사 미탐·오탐', () => {
  it.each([
    ['ALTER TABLE "Post" ADD COLUMN "x" TEXT NOT NULL;', 'ADD COLUMN NOT NULL'],
    ['DO $$ BEGIN ALTER TABLE p DROP COLUMN old; END $$;', 'DROP COLUMN'],
    ['TRUNCATE TABLE "Post";', 'TRUNCATE'],
    ['DELETE FROM "Post";', 'DELETE WITHOUT WHERE'],
    ['CREATE UNIQUE INDEX "Post_x_key" ON "Post"("x");', 'CREATE UNIQUE INDEX'],
    ['CREATE INDEX "Post_x_idx" ON "Post"("x");', 'CREATE INDEX'],
    ['DROP VIEW public.v;', 'DROP VIEW'],
    ['DROP TYPE public."Role_old";', 'DROP TYPE'],
    ['DROP FUNCTION public.f(int);', 'DROP FUNCTION'],
    ["SELECT E'\\'';\nALTER TABLE p DROP COLUMN old;\nSELECT '';", 'DROP COLUMN'],
    [
      'ALTER TABLE t ADD COLUMN a$$ int;\nALTER TABLE t DROP COLUMN old;\nALTER TABLE t ADD COLUMN b$$ int;',
      'DROP COLUMN',
    ],
    ['ALTER TABLE p DROP COLUMN U&"d\\0061ta";', 'DROP COLUMN'],
  ])('%s를 차단한다', (sql, rule) => expect(rules(sql)).toContain(rule));

  it.each([
    ['ALTER TABLE "Post" ALTER COLUMN "x" DROP DEFAULT;', 'DROP DEFAULT'],
    ['ALTER TABLE p ALTER COLUMN id DROP IDENTITY;', 'DROP IDENTITY'],
    ['DROP TRIGGER touch ON p;', 'DROP TRIGGER'],
    ['DROP SCHEMA app CASCADE;', 'DROP SCHEMA'],
  ])('%s에는 DROP COLUMN 대신 맞는 규칙명을 붙인다', (sql, rule) => expect(rules(sql)).toEqual([rule]));

  it.each([['ALTER  TYPE "Role" ADD VALUE \'ADMIN\';'], ['ALTER INDEX "a" RENAME TO "b";']])(
    '%s는 오탐하지 않는다',
    (sql) => expect(checkMigration(sql)).toEqual([]),
  );

  it('허용 표시는 같은 줄의 다음 문장까지 면제하지 않는다', () => {
    expect(
      checkMigration(
        '-- migration-lint: allow DROP COLUMN — reviewed retire\nALTER TABLE p DROP COLUMN a, DROP COLUMN b; ALTER TABLE q DROP COLUMN c;',
      ),
    ).toEqual([{ line: 2, rule: 'DROP COLUMN' }]);
  });

  it('디렉터리를 옮기며 DDL을 더한 migration을 rename으로 놓치지 않는다', () => {
    withGitRepo(({ cwd, put, move, commit }) => {
      // 내용 대부분이 같아 git의 rename 감지가 R로 묶는 크기다.
      const tables = Array.from({ length: 20 }, (_, index) => `CREATE TABLE "t${index}" (id text);`).join(
        '\n',
      );
      put('20250101_a', tables);
      const base = commit('base');
      move('20250101_a', '20250102_a');
      put('20250102_a', `${tables}\nALTER TABLE p DROP COLUMN old;`);
      commit('move');
      expect(migrationChanges({ base, cwd })).toEqual({
        added: [`${MIGRATIONS}/20250102_a/migration.sql`],
        changed: [{ file: `${MIGRATIONS}/20250101_a/migration.sql`, status: 'deleted' }],
      });
    });
  });

  it('develop 강제 push에서 fallback이 HEAD와 같으면 배포 브랜치와의 merge-base로 검사한다', () => {
    withGitRepo(({ cwd, git, commit }) => {
      const released = commit('released');
      git('update-ref', 'refs/remotes/origin/main', released);
      commit('develop-migration');
      git('update-ref', 'refs/remotes/origin/develop', 'HEAD');
      expect(migrationBase({ requested: 'f'.repeat(40), event: 'push', cwd })).toBe(released);
    });
  });

  it('push에서 비교 기준이 모두 HEAD 자신이면 0건으로 통과하지 않고 실패한다', () => {
    withGitRepo(({ cwd, git, commit }) => {
      commit('base');
      commit('develop-migration');
      git('update-ref', 'refs/remotes/origin/develop', 'HEAD');
      expect(() => migrationBase({ requested: 'f'.repeat(40), event: 'push', cwd })).toThrow(/no base ref/);
      git('update-ref', 'refs/remotes/origin/main', 'HEAD');
      expect(() => migrationBase({ requested: '0'.repeat(40), event: 'push', cwd })).toThrow(/no base ref/);
    });
  });
});
