import { spawnSync } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { createRequire } from 'node:module';

import type { INestApplication } from '@nestjs/common';
import dayjs from 'dayjs';
import supertest from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { MediaUploadPlanSchema } from '@game-feedback/contracts';

import { createApp } from '../app';
import { hash, token } from '../common/crypto';
import { assertDatabaseUrl } from '../database/database-url';
import { createPrismaAdapter } from '../database/prisma-adapter';
import { PrismaClient } from '../generated/prisma';

interface IUploadCase {
  name: string;
  table: string;
  counter: 'avatars' | 'posts' | 'attachments';
  limit: number;
  status: number;
  errorCode: string;
  path: (conversationId: string) => string;
}

const cases = [
  {
    name: '프로필 사진',
    table: 'AvatarUpload',
    counter: 'avatars',
    limit: 10,
    status: 429,
    errorCode: 'UPLOAD_LIMIT',
    path: () => '/api/profile/avatar/uploads',
  },
  {
    name: '게시물 미디어',
    table: 'PostMedia',
    counter: 'posts',
    limit: 20,
    status: 409,
    errorCode: 'MEDIA_LIMIT',
    path: () => '/api/post-media/uploads',
  },
  {
    name: '채팅 첨부파일',
    table: 'ChatAttachment',
    counter: 'attachments',
    limit: 4,
    status: 409,
    errorCode: 'ATTACHMENT_LIMIT',
    path: (conversationId: string) => `/api/conversations/${conversationId}/attachments/uploads`,
  },
] as const satisfies readonly IUploadCase[];
const require = createRequire(import.meta.url);
const origin = 'http://localhost:3300';
const input = { name: 'reservation.png', mimeType: 'image/png', size: 16 };

describe.each([1, 3])('업로드 예약 원자성 (연결 %i개)', (connectionLimit) => {
  const schema = `gf_test_upload_reservation_${randomBytes(8).toString('hex')}`;
  const state = {} as { app: INestApplication; db: PrismaClient; peerId: string };

  beforeAll(async () => {
    const target = new URL(process.env.DATABASE_URL ?? '');
    target.searchParams.set('schema', schema);
    const databaseUrl = assertDatabaseUrl(target.toString(), 'test');
    const migration = spawnSync(
      process.execPath,
      [require.resolve('prisma/build/index.js'), 'migrate', 'deploy'],
      { env: { ...process.env, DATABASE_URL: databaseUrl }, encoding: 'utf8' },
    );
    if (migration.status !== 0) throw new Error(`예약 테스트 migration 실패: ${migration.stderr}`);
    state.db = new PrismaClient({ adapter: createPrismaAdapter(databaseUrl) });
    target.searchParams.set('connection_limit', String(connectionLimit));
    target.searchParams.set('pool_timeout', '2');
    state.app = await createApp({
      databaseUrl: assertDatabaseUrl(target.toString(), 'test'),
      webOrigin: origin,
      rateLimit: false,
    });
    state.peerId = (
      await state.db.user.create({
        data: { nickname: `peer-${schema}`, termsVersion: 'test-v1', ageConfirmed: true },
      })
    ).id;
  }, 30_000);

  afterAll(async () => {
    await state.app?.close();
    if (!state.db) return;
    try {
      if (!/^gf_test_upload_reservation_[a-f0-9]{16}$/.test(schema)) throw new Error('Unowned test schema');
      await state.db.$executeRawUnsafe(`DROP SCHEMA "${schema}" CASCADE`);
    } finally {
      await state.db.$disconnect();
    }
  });

  async function actor() {
    const user = await state.db.user.create({
      data: { nickname: `uploader-${token()}`, termsVersion: 'test-v1', ageConfirmed: true },
    });
    const accessToken = token();
    await state.db.session.create({
      data: { userId: user.id, tokenHash: hash(accessToken), expiresAt: dayjs().add(15, 'minute').toDate() },
    });
    const [firstUserId, secondUserId] = [user.id, state.peerId].sort();
    const conversation = await state.db.chatConversation.create({
      data: { firstUserId: firstUserId ?? '', secondUserId: secondUserId ?? '' },
    });
    return { accessToken, conversationId: conversation.id };
  }

  async function counts() {
    return {
      objects: await state.db.mediaObject.count(),
      avatars: await state.db.avatarUpload.count(),
      posts: await state.db.postMedia.count(),
      attachments: await state.db.chatAttachment.count(),
    };
  }

  describe.each(cases)('$name', (uploadCase) => {
    function request(owner: Awaited<ReturnType<typeof actor>>, name = input.name) {
      return supertest(state.app.getHttpServer())
        .post(uploadCase.path(owner.conversationId))
        .set('Origin', origin)
        .set('Authorization', `Bearer ${owner.accessToken}`)
        .send({ ...input, name });
    }

    it('성공한 예약의 티켓과 저장소 메타데이터를 함께 생성해야 한다', async () => {
      const owner = await actor();
      const before = await counts();
      const response = await request(owner).expect(200);
      const plan = MediaUploadPlanSchema.parse(response.body);
      const object = await state.db.mediaObject.findUniqueOrThrow({
        where: { key: plan.fields.key ?? '' },
        include: { avatarUpload: true, postMedia: true, chatAttachment: true },
      });
      expect(object.backend).toBe('S3');
      expect([object.avatarUpload?.id, object.postMedia?.id, object.chatAttachment?.id]).toContain(plan.id);
      expect(await counts()).toEqual({
        ...before,
        objects: before.objects + 1,
        [uploadCase.counter]: before[uploadCase.counter] + 1,
      });
    });

    it('대기 개수 제한을 반복해서 거절해도 저장소 메타데이터를 남기지 않아야 한다', async () => {
      const owner = await actor();
      for (const index of Array.from({ length: uploadCase.limit }, (_, index) => index))
        await request(owner, `pending-${index}.png`).expect(200);
      const before = await counts();
      for (const attempt of [1, 2, 3]) {
        const response = await request(owner, `rejected-${attempt}.png`).expect(uploadCase.status);
        expect(response.body.errorCode).toBe(uploadCase.errorCode);
      }
      expect(await counts()).toEqual(before);
    });

    it('동시에 제한을 넘는 요청은 허용된 한 건의 티켓과 메타데이터만 생성해야 한다', async () => {
      const owner = await actor();
      for (const index of Array.from({ length: uploadCase.limit - 1 }, (_, index) => index))
        await request(owner, `pending-${index}.png`).expect(200);
      const before = await counts();
      const responses = await Promise.all(
        Array.from({ length: 6 }, (_, index) => request(owner, `concurrent-${index}.png`)),
      );
      expect(responses.filter((response) => response.status === 200)).toHaveLength(1);
      expect(responses.filter((response) => response.status === uploadCase.status)).toHaveLength(5);
      expect(await counts()).toEqual({
        ...before,
        objects: before.objects + 1,
        [uploadCase.counter]: before[uploadCase.counter] + 1,
      });
    });

    it('티켓 INSERT가 DB에서 실패하면 생성 중인 저장소 메타데이터도 롤백해야 한다', async () => {
      const owner = await actor();
      const before = await counts();
      await state.db.$executeRawUnsafe(
        `ALTER TABLE "${uploadCase.table}" ADD CONSTRAINT "reservation_test_failure" CHECK ("name" <> 'reject.png')`,
      );
      try {
        await request(owner, 'reject.png').expect(500);
        expect(await counts()).toEqual(before);
      } finally {
        await state.db.$executeRawUnsafe(
          `ALTER TABLE "${uploadCase.table}" DROP CONSTRAINT "reservation_test_failure"`,
        );
      }
      await request(owner).expect(200);
      expect(await counts()).toEqual({
        ...before,
        objects: before.objects + 1,
        [uploadCase.counter]: before[uploadCase.counter] + 1,
      });
    });
  });
});
