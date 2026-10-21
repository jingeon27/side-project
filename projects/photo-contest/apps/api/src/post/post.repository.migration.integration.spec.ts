import { randomBytes } from 'node:crypto';
import { readFile } from 'node:fs/promises';

import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { createTestApp, type ITestApi } from '../../test/support/app';

describe('기존 사진의 갤러리 이관', () => {
  let api: ITestApi;
  beforeAll(async () => {
    api = await createTestApp();
  });
  afterAll(async () => {
    await api?.close();
  });
  it('실제 마이그레이션으로 원본·숨김·시각·좋아요·파일 키를 보존해야 한다', async () => {
    const schema = 'migration_test_' + randomBytes(6).toString('hex');
    const sql = async (name: string) =>
      readFile(new URL(`../../prisma/migrations/${name}/migration.sql`, import.meta.url), 'utf8');
    const initial = await sql('20261012000000_init');
    const likes = await sql('20261013130000_likes_and_app_login');
    const gallery = await sql('20261015090000_gallery_posts');
    const publicGroups = await sql('20261019010000_public_groups');
    // 테스트 DB 안의 임시 스키마에서 이전 버전을 만든 뒤 새 SQL을 그대로 적용한다.
    // 실패하면 스키마 생성도 함께 rollback되어 개발 데이터나 다른 테스트에 닿지 않는다.
    await api.db.$transaction(async (tx) => {
      await tx.$executeRawUnsafe(`CREATE SCHEMA "${schema}"`);
      await tx.$executeRawUnsafe(`SET LOCAL search_path TO "${schema}"`);
      const execute = async (source: string) => {
        for (const statement of source.split(';').filter((s) => s.trim()))
          await tx.$executeRawUnsafe(statement);
      };
      await execute(initial);
      await execute(likes);
      await execute(`
        INSERT INTO "User" (id,nickname,provider,"providerId") VALUES ('author','회원','test','author'),('liker','친구','test','liker');
        INSERT INTO "Group" (id,name,"inviteHash","inviteToken") VALUES ('gallery','갤러리','hash','token');
        INSERT INTO "Contest" (id,"groupId",title,"startsAt","submissionEndsAt","endsAt") VALUES ('contest','gallery','지난 대회',now(),now(),now());
        INSERT INTO "Upload" (id,"tokenHash","userId","contestId","expiresAt","imageKey") VALUES ('upload','upload-hash','author','contest',now(),'12345678-1234-1234-1234-123456789012.webp');
        INSERT INTO "Submission" (id,"contestId","authorId",caption,"uploadId",hidden,"createdAt") VALUES ('photo','contest','author','기존 사진','upload',true,'2026-09-01');
        INSERT INTO "Like" ("submissionId","userId") VALUES ('photo','liker');
      `);
      await execute(gallery);
      await execute(publicGroups);
      expect(await tx.$queryRawUnsafe('SELECT id,visibility FROM "Group"')).toEqual([
        { id: 'gallery', visibility: 'PRIVATE' },
      ]);
      expect(
        await tx.$queryRawUnsafe('SELECT id,title,hidden,"legacySubmissionId","createdAt" FROM "Post"'),
      ).toEqual([
        {
          id: 'photo',
          title: '기존 사진',
          hidden: true,
          legacySubmissionId: 'photo',
          createdAt: new Date('2026-09-01T00:00:00Z'),
        },
      ]);
      expect(await tx.$queryRawUnsafe('SELECT "storageKey",kind FROM "PostUpload"')).toEqual([
        { storageKey: '12345678-1234-1234-1234-123456789012.webp', kind: 'PHOTO' },
      ]);
      expect(await tx.$queryRawUnsafe('SELECT "postId","userId" FROM "PostLike"')).toEqual([
        { postId: 'photo', userId: 'liker' },
      ]);
      expect(await tx.$queryRawUnsafe('SELECT id FROM "Submission"')).toEqual([{ id: 'photo' }]);
      await tx.$executeRawUnsafe(`DROP SCHEMA "${schema}" CASCADE`);
    });
  });
});
