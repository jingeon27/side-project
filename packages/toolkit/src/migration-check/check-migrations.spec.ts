import { afterEach, describe, expect, it, vi } from 'vitest';

import { checkMigration, main, migrationBase, migrationChanges } from './check-migrations';
import { MIGRATIONS, withGitRepo } from './test/git-repo';

const rules = (sql: string) => checkMigration(sql).map((error) => error.rule);

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
    [
      'UPDATE "Post" SET "title" = (SELECT "name" FROM "Group" WHERE "Group"."id" = 1);',
      'UPDATE WITHOUT WHERE',
    ],
    ['ALTER TABLE p ADD COLUMN x TEXT PRIMARY KEY;', 'ADD COLUMN NOT NULL'],
    ['ALTER TABLE p ADD CONSTRAINT p_x_key UNIQUE ("x");', 'ADD UNIQUE'],
    ['ALTER TABLE p ADD PRIMARY KEY ("x");', 'ADD PRIMARY KEY'],
    ['ALTER TABLE p ADD CONSTRAINT p_fk FOREIGN KEY (q) REFERENCES q(id);', 'ADD FOREIGN KEY'],
    ['ALTER TABLE p ADD COLUMN q TEXT REFERENCES q(id);', 'ADD FOREIGN KEY'],
    ['ALTER TABLE p ADD CONSTRAINT p_check CHECK (x > 0);', 'ADD CHECK'],
    ['DROP MATERIALIZED VIEW stats;', 'DROP MATERIALIZED VIEW'],
    ['DROP SEQUENCE "Post_id_seq";', 'DROP SEQUENCE'],
    ['DROP EXTENSION pg_trgm;', 'DROP EXTENSION'],
    ['ALTER TABLE p ALTER COLUMN x DROP EXPRESSION;', 'DROP EXPRESSION'],
    ["DO $$ BEGIN EXECUTE format('DROP TABLE %I', 'p'); END $$;", 'DYNAMIC SQL'],
    ["DO 'BEGIN DROP TABLE p; END';", 'DYNAMIC SQL'],
  ])('%s를 차단한다', (sql, rule) => expect(rules(sql)).toContain(rule));

  it.each([
    ['UPDATE "Post" p SET "title" = 1 WHERE p."id" = 2;'],
    ['DELETE FROM "Post" USING "Group" WHERE "Post"."groupId" = "Group"."id";'],
    ['CREATE INDEX CONCURRENTLY "Post_x_idx" ON "Post"("x");'],
    ['ALTER TABLE p ADD CONSTRAINT p_fk FOREIGN KEY (q) REFERENCES q(id) NOT VALID;'],
    [
      'ALTER TABLE p ADD CONSTRAINT p_check CHECK (x > 0) NOT VALID;\nALTER TABLE p VALIDATE CONSTRAINT p_check;',
    ],
    ['ALTER TABLE p ADD CONSTRAINT p_x_key UNIQUE USING INDEX p_x_idx;'],
    ["ALTER TABLE p ADD COLUMN x TEXT NOT NULL DEFAULT '';"],
    ['ALTER TABLE p ADD COLUMN x INT GENERATED ALWAYS AS IDENTITY;'],
    ['ALTER TABLE p ADD COLUMN x BIGSERIAL NOT NULL;'],
    ['CREATE TRIGGER t BEFORE UPDATE OR DELETE OR TRUNCATE ON p EXECUTE FUNCTION f();'],
    ['GRANT SELECT, UPDATE, DELETE, TRUNCATE ON p TO r;\nGRANT EXECUTE ON FUNCTION f() TO r;'],
    [
      'ALTER TABLE p ADD CONSTRAINT p_fk FOREIGN KEY (q) REFERENCES q(id) ON DELETE SET NULL ON UPDATE CASCADE NOT VALID;',
    ],
    ['COMMENT ON TABLE p IS $$DROP TABLE p$$;'],
  ])('%s는 통과한다', (sql) => expect(checkMigration(sql)).toEqual([]));

  it('같은 migration에서 만든 빈 테이블의 인덱스·제약·컬럼 추가는 잠금 위험이 없어 허용한다', () => {
    expect(
      checkMigration(
        [
          'CREATE TABLE "Like" ("postId" TEXT NOT NULL, "userId" TEXT NOT NULL);',
          'CREATE UNIQUE INDEX "Like_key" ON "Like"("postId", "userId");',
          'CREATE INDEX "Like_userId_idx" ON public."Like"("userId");',
          'ALTER TABLE "Like" ADD CONSTRAINT "Like_postId_fkey" FOREIGN KEY ("postId") REFERENCES "Post"("id");',
          'ALTER TABLE "Like" ADD COLUMN "kind" TEXT NOT NULL;',
          'CREATE INDEX "Post_x_idx" ON "Post"("x");',
        ].join('\n'),
      ),
    ).toEqual([{ line: 6, rule: 'CREATE INDEX' }]);
    // 따옴표 없는 이름은 소문자로 접으므로 "Post"와 post는 다른 테이블이다.
    expect(rules('CREATE TABLE "Post" (id text);\nCREATE INDEX post_idx ON post (id);')).toEqual([
      'CREATE INDEX',
    ]);
  });

  it('Prisma Warnings 주석이 남아 있으면 허용 표시와 관계없이 실패한다', () => {
    expect(
      checkMigration(
        '/*\n  Warnings:\n\n  - Added the required column `x` without a default value.\n\n*/\n-- migration-lint: allow ADD COLUMN NOT NULL — table is empty in every environment\nALTER TABLE p ADD COLUMN x TEXT NOT NULL;',
      ),
    ).toEqual([{ line: 1, rule: 'PRISMA WARNINGS' }]);
  });

  it('문자열·주석·식별자와 본문 안 문자열은 DDL로 오인하지 않는다', () => {
    expect(
      checkMigration(
        `-- DROP TABLE x;\nCREATE TABLE "RENAME" (id text, description text DEFAULT 'DROP COLUMN x');\n/* outer /* nested */ DROP INDEX idx; */\nDO $body$ BEGIN RAISE NOTICE 'DROP NOT NULL'; END $body$;`,
      ),
    ).toEqual([]);
  });

  it('함수 본문도 SQL로 검사한다', () => {
    expect(
      checkMigration(
        "CREATE FUNCTION touch() RETURNS trigger LANGUAGE plpgsql AS $fn$\nBEGIN\n  RAISE EXCEPTION 'DROP TABLE x';\n  UPDATE p SET x = 1;\n  RETURN NEW;\nEND $fn$;",
      ),
    ).toEqual([{ line: 4, rule: 'UPDATE WITHOUT WHERE' }]);
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
    expect(
      checkMigration('-- migration-lint: allow DROP COLUMN — ok\nALTER TABLE p DROP COLUMN old;'),
    ).toHaveLength(1);
  });

  it('허용 표시는 연속한 주석 줄로 쌓고 여러 줄 문장 전체에 적용한다', () => {
    expect(
      checkMigration(
        '-- migration-lint: allow DROP CONSTRAINT — replaced by p_new_key last release\n-- migration-lint: allow DROP COLUMN — old readers retired for two weeks\nALTER TABLE p DROP CONSTRAINT p_old_key,\n  DROP COLUMN old;',
      ),
    ).toEqual([]);
    expect(
      checkMigration(
        '-- migration-lint: allow ADD FOREIGN KEY — table holds a few hundred rows\nALTER TABLE "Comment" ADD CONSTRAINT "Comment_parent_fkey"\n  FOREIGN KEY ("parentId") REFERENCES "Comment"("id")\n  ON DELETE NO ACTION;',
      ),
    ).toEqual([]);
  });

  it('DO 블록 안 문장은 본문 안의 바로 앞 허용 표시를 쓴다', () => {
    expect(
      checkMigration(
        'DO $$\nBEGIN\n  ALTER TABLE p ADD COLUMN x TEXT;\n  -- migration-lint: allow DROP COLUMN — old readers retired\n  ALTER TABLE p DROP COLUMN old;\n  ALTER TABLE q DROP COLUMN old;\nEND $$;',
      ),
    ).toEqual([{ line: 6, rule: 'DROP COLUMN' }]);
  });
});

describe('기준 ref 이후 바뀐 migration 파일', () => {
  it('새 migration은 검사 대상으로, 이미 있던 migration의 수정·삭제는 거부 대상으로 나눈다', () => {
    withGitRepo(({ cwd, put, commit, git }) => {
      put('old', 'DROP TABLE old;');
      put('gone', 'CREATE TABLE gone(id text);');
      const base = commit('base');
      put('old', 'DROP TABLE old; -- changed');
      put('new', 'CREATE TABLE new(id text);');
      git('rm', '-q', `${MIGRATIONS}/gone/migration.sql`);
      commit('next');
      expect(migrationChanges({ base, cwd })).toEqual({
        added: [`${MIGRATIONS}/new/migration.sql`],
        changed: [
          { file: `${MIGRATIONS}/gone/migration.sql`, status: 'deleted' },
          { file: `${MIGRATIONS}/old/migration.sql`, status: 'modified' },
        ],
      });
    });
  });

  it('main은 수정된 migration과 새 migration의 위반을 보고하고 실패 코드를 남긴다', () => {
    const errors: string[] = [];
    vi.spyOn(console, 'error').mockImplementation((message: string) => errors.push(message));
    vi.spyOn(console, 'log').mockImplementation(() => undefined);
    withGitRepo(({ cwd, put, commit }) => {
      put('old', 'CREATE TABLE old(id text);');
      const base = commit('base');
      put('old', 'CREATE TABLE old(id text, x text);');
      put('new', 'ALTER TABLE old ADD COLUMN y TEXT NOT NULL;');
      commit('next');
      main({ env: { MIGRATION_BASE_REF: base, GITHUB_EVENT_NAME: 'pull_request' }, cwd, reviews: {} });
    });
    expect(process.exitCode).toBe(1);
    expect(errors).toEqual([
      expect.stringContaining('old/migration.sql: existing migration.sql was modified'),
      expect.stringContaining('new/migration.sql:1: ADD COLUMN NOT NULL requires'),
    ]);
  });

  afterEach(() => {
    vi.restoreAllMocks();
    process.exitCode = undefined;
  });
});

describe('migration 비교 기준', () => {
  it('강제 push로 HEAD의 조상이 아닌 before는 develop 기준으로 바꾼다', () => {
    withGitRepo(({ cwd, git, commit }) => {
      commit('base');
      git('checkout', '-qb', 'feature');
      const previousTip = commit('feature-old');
      git('checkout', '-q', 'develop');
      const developTip = commit('develop-migration');
      git('checkout', '-qB', 'feature');
      const tip = commit('feature-rebased');
      expect(migrationBase({ requested: previousTip, fallback: 'develop', cwd })).toBe(developTip);
      expect(migrationBase({ requested: 'f'.repeat(40), fallback: 'develop', cwd })).toBe(developTip);
      expect(migrationBase({ requested: '0'.repeat(40), fallback: 'develop', cwd })).toBe(developTip);
      commit('feature-next');
      expect(migrationBase({ requested: tip, fallback: 'develop', cwd })).toBe(tip);
    });
  });

  it('main에서 workflow_dispatch로 다시 돌리면 배포되지 않은 커밋이 없어 HEAD를 기준으로 삼는다', () => {
    withGitRepo(({ cwd, git, commit }) => {
      commit('base');
      const released = commit('released');
      git('update-ref', 'refs/remotes/origin/main', released);
      commit('develop-only');
      git('update-ref', 'refs/remotes/origin/develop', 'HEAD');
      git('checkout', '-q', released);
      expect(migrationBase({ requested: 'origin/develop', event: 'workflow_dispatch', cwd })).toBe(released);
    });
  });
});
