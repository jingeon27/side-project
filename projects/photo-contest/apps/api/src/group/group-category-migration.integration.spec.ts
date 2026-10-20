import { randomBytes } from 'node:crypto';
import { readdir,readFile } from 'node:fs/promises';
import { afterAll,beforeAll,describe,expect,it } from 'vitest';
import { createTestApp,type ITestApi } from '../../test/support/app';

describe('카테고리 추가 마이그레이션의 이전 앱 호환', () => {
  let api: ITestApi;
  beforeAll(async () => {
    api = await createTestApp();
  });
  afterAll(async () => {
    await api?.close();
  });
  it('기존 글을 미분류로 보존하고 이전 앱의 글 작성도 허용해야 한다', async () => {
    const schema = 'migration_test_' + randomBytes(6).toString('hex');
    const root = new URL('../../prisma/migrations/', import.meta.url);
    const current = '20261020040000_group_categories';
    const previous = (await readdir(root)).filter((name) => /^\d+_/.test(name) && name < current).sort();
    await api.db.$transaction(
      async (tx) => {
        await tx.$executeRawUnsafe(`CREATE SCHEMA "${schema}"`);
        await tx.$executeRawUnsafe(`SET LOCAL search_path TO "${schema}"`);
        const execute = async (sql: string) => {
          for (const statement of sql.split(';').filter((value) => value.trim()))
            await tx.$executeRawUnsafe(statement);
        };
        for (const name of previous)
          await execute(await readFile(new URL(`${name}/migration.sql`, root), 'utf8'));
        await execute(`INSERT INTO "User" (id,nickname,provider,"providerId") VALUES ('author','기존 회원','testing','old-author');
INSERT INTO "Group" (id,name,"inviteHash","inviteToken") VALUES ('group','기존 그룹','hash','token');
INSERT INTO "Post" (id,"groupId","authorId",title,"linkUrl") VALUES ('before','group','author','이전 글','https://example.com');`);
        await execute(await readFile(new URL(`${current}/migration.sql`, root), 'utf8'));
        expect(await tx.$queryRawUnsafe('SELECT id,title,"categoryId" FROM "Post"')).toEqual([
          { id: 'before', title: '이전 글', categoryId: null },
        ]);
        await execute(
          `INSERT INTO "Post" (id,"groupId","authorId",title,"linkUrl") VALUES ('after','group','author','이전 앱이 쓴 글','https://example.com');`,
        );
        expect(await tx.$queryRawUnsafe('SELECT "categoryId" FROM "Post" WHERE id=\'after\'')).toEqual([
          { categoryId: null },
        ]);
        await tx.$executeRawUnsafe(`DROP SCHEMA "${schema}" CASCADE`);
      },
      { timeout: 20_000 },
    );
  });
});
