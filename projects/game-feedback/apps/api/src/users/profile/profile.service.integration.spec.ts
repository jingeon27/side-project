import { spawnSync } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { createRequire } from 'node:module';

import type { INestApplication } from '@nestjs/common';
import dayjs from 'dayjs';
import sharp from 'sharp';
import supertest from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { MediaUploadPlanSchema } from '@game-feedback/contracts';

import { createApp } from '../../app';
import { hash, token } from '../../common/crypto';
import { createPrismaAdapter } from '../../database/prisma-adapter';
import { PrismaClient } from '../../generated/prisma';
import { MEDIA_COMPLETE_GRACE_SECONDS } from '../../media-storage/media-storage.policy';
import { MediaStorage } from '../../media-storage/media-storage.service';
import { assertDatabaseUrl } from '../../security';
import { responseLocation } from '../../testing/http-response';
import { transferMedia } from '../../testing/media-upload';
import { S3TestStorage } from '../../testing/s3';

const require = createRequire(import.meta.url);
const schema = `gf_test_profile_${randomBytes(8).toString('hex')}`;
const origin = 'http://localhost:3300';
describe('프로필 정보와 사진 HTTP 통합', () => {
  const s3 = new S3TestStorage();
  const state = {} as {
    app: INestApplication;
    db: PrismaClient;
    userId: string;
    otherId: string;
    accessToken: string;
    otherToken: string;
    photo: Buffer;
  };
  beforeAll(async () => {
    const target = new URL(process.env.DATABASE_URL ?? 'http://unused');
    target.searchParams.set('schema', schema);
    const url = assertDatabaseUrl(target.toString(), 'test');
    const result = spawnSync(
      process.execPath,
      [require.resolve('prisma/build/index.js'), 'migrate', 'deploy'],
      { env: { ...process.env, DATABASE_URL: url }, encoding: 'utf8' },
    );
    if (result.status !== 0) throw new Error(result.stdout + result.stderr);
    state.db = new PrismaClient({ adapter: createPrismaAdapter(url) });
    state.app = await createApp({
      databaseUrl: url,
      prisma: state.db,
      webOrigin: origin,
      rateLimit: false,
      mediaStorage: s3.config,
    });
    const user = await state.db.user.create({
      data: { nickname: '프로필 작성자', termsVersion: 'v1', ageConfirmed: true },
    });
    state.userId = user.id;
    const other = await state.db.user.create({
      data: { nickname: '프로필 방문자', termsVersion: 'v1', ageConfirmed: true },
    });
    state.otherId = other.id;
    state.accessToken = token();
    state.otherToken = token();
    for (const [userId, value] of [
      [user.id, state.accessToken],
      [other.id, state.otherToken],
    ] as const)
      await state.db.session.create({
        data: { userId, tokenHash: hash(value), expiresAt: dayjs().add(1, 'hour').toDate() },
      });
    state.photo = await sharp({ create: { width: 900, height: 600, channels: 3, background: '#2255cc' } })
      .jpeg()
      .toBuffer();
  }, 30000);
  afterAll(async () => {
    await state.app?.close();
    if (state.db) {
      if (!/^gf_test_profile_[a-f0-9]{16}$/.test(schema)) throw new Error('Unowned profile schema');
      await state.db.$executeRawUnsafe(`DROP SCHEMA "${schema}" CASCADE`);
      await state.db.$disconnect();
    }
    await s3.close();
  });
  const http = () => supertest(state.app.getHttpServer());
  const authenticated = () =>
    http().patch('/api/profile').set('Authorization', `Bearer ${state.accessToken}`).set('Origin', origin);
  async function reserve(bytes = state.photo, mimeType = 'image/jpeg') {
    const response = await http()
      .post('/api/profile/avatar/uploads')
      .set('Authorization', `Bearer ${state.accessToken}`)
      .set('Origin', origin)
      .send({ name: 'photo.jpg', mimeType, size: bytes.length })
      .expect(200);
    return MediaUploadPlanSchema.parse(response.body);
  }
  async function upload(bytes = state.photo, mimeType = 'image/jpeg', status = 200) {
    const plan = await reserve(bytes, mimeType);
    expect((await transferMedia(plan, bytes, mimeType)).status).toBe(204);
    return http()
      .post(`/api/profile/avatar/uploads/${plan.id}/complete`)
      .set('Authorization', `Bearer ${state.accessToken}`)
      .set('Origin', origin)
      .expect(status);
  }
  it('비로그인 변경·업로드와 잘못된 Origin을 차단한다', async () => {
    await http().patch('/api/profile').set('Origin', origin).send({ bio: '소개' }).expect(401);
    await http()
      .post('/api/profile/avatar/uploads')
      .set('Origin', origin)
      .send({ name: 'photo.jpg', mimeType: 'image/jpeg', size: state.photo.length })
      .expect(401);
    await http()
      .patch('/api/profile')
      .set('Authorization', `Bearer ${state.accessToken}`)
      .set('Origin', 'https://evil.test')
      .send({ bio: '소개' })
      .expect(403);
  });
  it('링크 변경을 거부하고 기존 링크도 공개 응답에 노출하지 않는다', async () => {
    await state.db.user.update({
      where: { id: state.userId },
      data: { profileLinks: [{ label: '이전 링크', url: 'https://video.example/@player' }] },
    });
    await authenticated().send({ links: [] }).expect(400);
    await authenticated().send({ nickname: '프로필 작성자', links: [] }).expect(400);
    const result = await http().get(`/api/users/${state.userId}`).expect(200);
    expect(result.body).not.toHaveProperty('links');
  });
  it('닉네임과 자기소개를 수정하고 다른 사용자의 프로필을 보존한다', async () => {
    const updated = await authenticated()
      .send({ nickname: '  새 닉네임  ', bio: '  소개\nhttps://royaleapi.com/player/QLLLPR89G  ' })
      .expect(200);
    expect(updated.body).toMatchObject({
      author: { nickname: '새 닉네임' },
      bio: '소개\nhttps://royaleapi.com/player/QLLLPR89G',
    });
    const session = await http()
      .get('/api/session')
      .set('Authorization', `Bearer ${state.accessToken}`)
      .expect(200);
    expect(session.body.user.nickname).toBe('새 닉네임');
    const other = await state.db.user.findUniqueOrThrow({ where: { id: state.otherId } });
    expect(other.nickname).toBe('프로필 방문자');
    expect(other.bio).toBe('');
    const cleared = await authenticated().send({ bio: '' }).expect(200);
    expect(cleared.body).toMatchObject({ author: { nickname: '새 닉네임' }, bio: '' });
  });
  it('닉네임 형식과 소개 길이를 검사하고 권한·다른 사용자 필드는 변경하지 못한다', async () => {
    for (const input of [
      { nickname: 'a' },
      { nickname: 'x'.repeat(25) },
      { nickname: '금지💥' },
      { bio: 'x'.repeat(501) },
      { bio: '소개', role: 'ADMIN' },
      { nickname: '침입', userId: state.otherId },
      {},
    ]) {
      await authenticated().send(input).expect(400);
    }
    const stored = await state.db.user.findUniqueOrThrow({ where: { id: state.userId } });
    expect(stored.role).toBe('USER');
    expect(stored.nickname).toBe('새 닉네임');
  });
  it('S3 사진의 버전 URL을 공개하고 DB에는 바이트를 저장하지 않는다', async () => {
    const result = await upload();
    const url = result.body.author.avatarUrl as string;
    expect(url).toMatch(/\/avatar\?v=/);
    const redirect = await http().get(url).expect(307);
    expect(redirect.headers['cache-control']).toBe('private, no-store');
    const file = await fetch(responseLocation(redirect));
    expect(file.headers.get('content-type')).toBe('image/jpeg');
    expect(Buffer.from(await file.arrayBuffer())).toEqual(state.photo);
    const stored = await state.db.userAvatar.findUniqueOrThrow({
      where: { userId: state.userId },
      include: { object: true },
    });
    expect(stored.bytes).toBeNull();
    expect(stored.object?.backend).toBe('S3');
    const session = await http()
      .get('/api/session')
      .set('Authorization', `Bearer ${state.accessToken}`)
      .expect(200);
    expect(session.body.user.avatarUrl).toBe(url);
    const replaced = await upload();
    expect(replaced.body.author.avatarUrl).not.toBe(url);
    expect(await state.db.userAvatar.count({ where: { userId: state.userId } })).toBe(1);
  });
  it('확장자·MIME만 위장한 파일을 확정하지 않는다', async () => {
    await upload(Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"/>'), 'image/png', 400);
    await upload(Buffer.from('not-image'), 'image/webp', 400);
  });
  it('예약 소유권과 만료를 검사하고 완료 재시도는 같은 사진을 반환한다', async () => {
    const plan = await reserve();
    const path = `/api/profile/avatar/uploads/${plan.id}/complete`;
    await http()
      .post(path)
      .set('Authorization', `Bearer ${state.otherToken}`)
      .set('Origin', origin)
      .expect(404);
    await http()
      .post(path)
      .set('Authorization', `Bearer ${state.accessToken}`)
      .set('Origin', origin)
      .expect(400);
    expect((await transferMedia(plan, state.photo, 'image/jpeg')).status).toBe(204);
    const completed = await http()
      .post(path)
      .set('Authorization', `Bearer ${state.accessToken}`)
      .set('Origin', origin)
      .expect(200);
    const retried = await http()
      .post(path)
      .set('Authorization', `Bearer ${state.accessToken}`)
      .set('Origin', origin)
      .expect(200);
    expect(retried.body.author.avatarUrl).toBe(completed.body.author.avatarUrl);
    // 서명 만료 뒤에 끝난 전송도 유예 시간 안이면 확정한다.
    const late = await reserve();
    expect((await transferMedia(late, state.photo, 'image/jpeg')).status).toBe(204);
    await state.db.avatarUpload.update({
      where: { id: late.id },
      data: { expiresAt: dayjs().subtract(1, 'second').toDate() },
    });
    await http()
      .post(`/api/profile/avatar/uploads/${late.id}/complete`)
      .set('Authorization', `Bearer ${state.accessToken}`)
      .set('Origin', origin)
      .expect(200);
    const expired = await reserve();
    await state.db.avatarUpload.update({
      where: { id: expired.id },
      data: {
        expiresAt: dayjs()
          .subtract(MEDIA_COMPLETE_GRACE_SECONDS + 1, 'second')
          .toDate(),
      },
    });
    await http()
      .post(`/api/profile/avatar/uploads/${expired.id}/complete`)
      .set('Authorization', `Bearer ${state.accessToken}`)
      .set('Origin', origin)
      .expect(409);
  });
  it('차단된 방문자에게 사진과 공개 프로필을 함께 숨긴다', async () => {
    await state.db.block.create({ data: { userId: state.otherId, blockedUserId: state.userId } });
    for (const path of [`/api/users/${state.userId}`, `/api/users/${state.userId}/avatar`])
      await http().get(path).set('Authorization', `Bearer ${state.otherToken}`).expect(404);
    await state.db.block.deleteMany({ where: { userId: state.otherId } });
  });
  it('정리 작업은 사용 중인 사진을 유지하고 삭제 시 기본 아바타로 복원한다', async () => {
    const live = await state.db.userAvatar.findUniqueOrThrow({ where: { userId: state.userId } });
    await state.db.mediaObject.updateMany({
      where: { id: live.objectId ?? '' },
      data: {
        createdAt: dayjs()
          .subtract(30 * 24, 'hour')
          .toDate(),
        retiredAt: dayjs()
          .subtract(20 * 24, 'hour')
          .toDate(),
      },
    });
    await state.app.get(MediaStorage).prune();
    await http().get(`/api/users/${state.userId}/avatar`).expect(307);
    const result = await http()
      .delete('/api/profile/avatar')
      .set('Authorization', `Bearer ${state.accessToken}`)
      .set('Origin', origin)
      .expect(200);
    expect(result.body.author.avatarUrl).toBeNull();
    await http().get(`/api/users/${state.userId}/avatar`).expect(404);
  });
});
