import { randomBytes } from 'node:crypto';
import { readdir, readFile } from 'node:fs/promises';

import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { createTestApp, type ITestApi } from '../../test/support/app';

describe('붙은 업로드의 만료를 비우는 마이그레이션', () => {
  let api: ITestApi;
  beforeAll(async () => {
    api = await createTestApp();
  });
  afterAll(async () => {
    await api?.close();
  });

  it('게시물·제출한 사진·현재 대표·배경 사진의 업로드만 만료를 비우고 나머지는 그대로 둬야 한다', async () => {
    const schema = 'migration_test_' + randomBytes(6).toString('hex');
    const root = new URL('../../prisma/migrations/', import.meta.url);
    const current = '20261028010200_attached_upload_expiry';
    const previous = (await readdir(root)).filter((name) => /^\d+_/.test(name) && name < current).sort();
    await api.db.$transaction(
      async (tx) => {
        await tx.$executeRawUnsafe(`CREATE SCHEMA "${schema}"`);
        await tx.$executeRawUnsafe(`SET LOCAL search_path TO "${schema}"`);
        // 임시 스키마 전체를 이 트랜잭션 안에서 만들고 지우므로 CONCURRENTLY 인덱스도 일반 인덱스로 만든다.
        const execute = async (sql: string) => {
          for (const statement of sql
            .replace(/\bCONCURRENTLY\b/g, '')
            .split(';')
            .filter((value) => value.trim()))
            await tx.$executeRawUnsafe(statement);
        };
        for (const name of previous)
          await execute(await readFile(new URL(`${name}/migration.sql`, root), 'utf8'));
        const upload = (id: string) => `('${id}','hash-${id}','author','group','2026-01-01','${id}-key')`;
        await execute(`
INSERT INTO "User" (id,nickname,provider,"providerId") VALUES ('author','기존 회원','testing','expiry-author');
INSERT INTO "Group" (id,name,"inviteHash","inviteToken") VALUES ('group','기존 그룹','hash','token');
INSERT INTO "Contest" (id,"groupId",title,"startsAt","submissionEndsAt","endsAt") VALUES ('contest','group','대회',now(),now(),now());
INSERT INTO "PostUpload" (id,"tokenHash","userId","groupId","expiresAt","storageKey") VALUES ${[
          'posted',
          'submitted',
          'pending-photo',
          'current-avatar',
          'current-cover',
          'old-avatar',
          'unused',
        ]
          .map(upload)
          .join(',')};
INSERT INTO "Post" (id,"groupId","authorId",title,"uploadId") VALUES ('post','group','author','기존 글','posted');
INSERT INTO "Upload" (id,"tokenHash","userId","contestId","expiresAt","imageKey","mediaUploadId") VALUES
  ('grant','grant-hash','author','contest','2026-01-01','submitted-key','submitted'),
  ('pending','pending-hash','author','contest','2026-01-01','pending-photo-key','pending-photo');
INSERT INTO "Submission" (id,"contestId","authorId",caption,"uploadId") VALUES ('photo','contest','author','사진','grant');
INSERT INTO "GroupAvatar" (id,"groupId","storageKey","expiresAt","mediaUploadId") VALUES
  ('avatar','group','current-avatar-key','2026-01-01','current-avatar'),
  ('cover','group','current-cover-key','2026-01-01','current-cover'),
  ('replaced','group','old-avatar-key','2026-01-01','old-avatar');
UPDATE "Group" SET "avatarId" = 'avatar', "coverId" = 'cover' WHERE id = 'group';`);
        await execute(await readFile(new URL(`${current}/migration.sql`, root), 'utf8'));
        const rows = await tx.$queryRawUnsafe<{ id: string; expiresAt: Date | null }[]>(
          'SELECT id,"expiresAt" FROM "PostUpload" ORDER BY id',
        );
        expect(Object.fromEntries(rows.map(({ id, expiresAt }) => [id, expiresAt]))).toEqual({
          'current-avatar': null,
          'current-cover': null,
          'old-avatar': new Date('2026-01-01T00:00:00Z'),
          'pending-photo': new Date('2026-01-01T00:00:00Z'),
          posted: null,
          submitted: null,
          unused: new Date('2026-01-01T00:00:00Z'),
        });
        await tx.$executeRawUnsafe(`DROP SCHEMA "${schema}" CASCADE`);
      },
      { timeout: 20_000 },
    );
  });
});
