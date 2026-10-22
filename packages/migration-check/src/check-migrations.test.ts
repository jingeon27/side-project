import { describe, expect, it } from 'vitest';

import { checkMigration } from './check-migrations.mjs';

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
});
