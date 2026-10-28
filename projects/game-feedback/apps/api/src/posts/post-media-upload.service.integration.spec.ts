import { spawnSync } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { createRequire } from 'node:module';

import type { INestApplication } from '@nestjs/common';
import supertest from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { MediaUploadPlanSchema } from '@game-feedback/contracts';

import { createApp } from '../app';
import { createPrismaAdapter } from '../database/prisma-adapter';
import { PrismaClient } from '../generated/prisma';
import {
  MEDIA_COMPLETE_GRACE_SECONDS,
  MEDIA_UPLOAD_TTL_SECONDS,
} from '../media-storage/media-storage.policy';
import { MediaStorage } from '../media-storage/media-storage.service';
import { assertDatabaseUrl } from '../security';
import { seed } from '../seed';
import { responseLocation } from '../testing/http-response';
import { S3TestStorage } from '../testing/s3';

const require = createRequire(import.meta.url);
const origin = 'http://localhost:3300';
const schema = `gf_test_presigned_${randomBytes(8).toString('hex')}`;
const png = Buffer.from('89504e470d0a1a0a0001020304050607', 'hex');
type TDirectPlan = ReturnType<typeof MediaUploadPlanSchema.parse>;
interface IState {
  app: INestApplication;
  db: PrismaClient;
  owner: ReturnType<typeof supertest.agent>;
  outsider: ReturnType<typeof supertest.agent>;
  categoryId: string;
  databaseUrl: string;
}

describe('게시글 S3 직접 업로드', () => {
  const state = {} as IState;
  const s3 = new S3TestStorage();
  beforeAll(async () => {
    const target = new URL(process.env.DATABASE_URL ?? '');
    target.searchParams.set('schema', schema);
    state.databaseUrl = assertDatabaseUrl(target.toString(), 'test');
    const result = spawnSync(
      process.execPath,
      [require.resolve('prisma/build/index.js'), 'migrate', 'deploy'],
      { env: { ...process.env, DATABASE_URL: state.databaseUrl }, encoding: 'utf8' },
    );
    if (result.status !== 0) throw new Error(`Isolated migration failed: ${result.stdout}\n${result.stderr}`);
    state.db = new PrismaClient({ adapter: createPrismaAdapter(state.databaseUrl) });
    await seed(state.db, false);
    state.app = await createApp({
      databaseUrl: state.databaseUrl,
      prisma: state.db,
      webOrigin: origin,
      demoMode: true,
      rateLimit: false,
      mediaStorage: s3.config,
    });
    s3.observe(state.app.get(MediaStorage));
    state.owner = supertest.agent(state.app.getHttpServer());
    state.outsider = supertest.agent(state.app.getHttpServer());
    await state.owner
      .post('/api/auth/demo')
      .set('Origin', origin)
      .send({ nickname: 'S3 작성자' })
      .expect(200);
    await state.outsider
      .post('/api/auth/demo')
      .set('Origin', origin)
      .send({ nickname: 'S3 외부인' })
      .expect(200);
    state.categoryId = (await state.owner.get('/api/categories').expect(200)).body[0].id;
  }, 30_000);
  afterAll(async () => {
    await state.app?.close();
    if (state.db) {
      if (!/^gf_test_presigned_[a-f0-9]{16}$/.test(schema)) throw new Error('Unowned schema');
      await state.db.$executeRawUnsafe(`DROP SCHEMA "${schema}" CASCADE`);
      await state.db.$disconnect();
    }
    await s3.close();
  });
  async function reserve() {
    const response = await state.owner
      .post('/api/post-media/uploads')
      .set('Origin', origin)
      .send({ name: '리플레이.png', mimeType: 'image/png', size: png.length })
      .expect(200);
    const plan = MediaUploadPlanSchema.parse(response.body);
    return plan;
  }
  async function transfer(plan: TDirectPlan, bytes: Buffer = png) {
    const body = new FormData();
    Object.entries(plan.fields).forEach(([key, value]) => body.append(key, value));
    body.append('file', new Blob([Uint8Array.from(bytes)], { type: 'image/png' }), '리플레이.png');
    return fetch(plan.url, { method: 'POST', body });
  }
  function publish(id: string) {
    return state.owner
      .post('/api/posts')
      .set('Origin', origin)
      .send({
        categoryId: state.categoryId,
        board: 'FREE',
        title: '직접 전송한 사진',
        body: '본문',
        document: { ops: [{ insert: { image: `/api/post-media/${id}` } }, { insert: '본문\n' }] },
      });
  }

  it('소유권·Origin·입력을 확인하고 미완료 파일의 조회와 글 연결을 거부해야 한다', async () => {
    await supertest(state.app.getHttpServer())
      .post('/api/post-media/uploads')
      .set('Origin', origin)
      .send({})
      .expect(401);
    await state.owner
      .post('/api/post-media/uploads')
      .set('Origin', 'https://foreign.test')
      .send({})
      .expect(403);
    await state.owner
      .post('/api/post-media/uploads')
      .set('Origin', origin)
      .send({ name: 'x.svg', mimeType: 'image/svg+xml', size: 10 })
      .expect(400);
    await state.owner
      .post('/api/post-media/uploads')
      .set('Origin', origin)
      .send({ name: 'x.png', mimeType: 'image/png', size: 25 * 1024 * 1024 + 1 })
      .expect(400);
    const plan = await reserve();
    await state.owner.get(`/api/post-media/${plan.id}`).expect(404);
    await state.owner.post(`/api/post-media/${plan.id}/complete`).set('Origin', origin).expect(400);
    await state.outsider.post(`/api/post-media/${plan.id}/complete`).set('Origin', origin).expect(404);
    await publish(plan.id).expect(400);
    const existing = (
      await state.owner
        .post('/api/posts')
        .set('Origin', origin)
        .send({
          categoryId: state.categoryId,
          board: 'FREE',
          title: 'DB 연결 경계 검사',
          body: '미완료 파일을 연결할 수 없어야 합니다.',
        })
        .expect(200)
    ).body;
    await expect(
      state.db.postMedia.update({ where: { id: plan.id }, data: { postId: existing.id } }),
    ).rejects.toThrow();
    await state.owner.delete(`/api/post-media/${plan.id}`).set('Origin', origin).expect(200);
  });

  it('크기를 제한한 실제 서명 정책으로 전송하고 확정 뒤 임시 주소로 원본을 덮어쓸 수 없어야 한다', async () => {
    const plan = await reserve();
    const policy = JSON.parse(Buffer.from(plan.fields.Policy ?? '', 'base64').toString());
    expect(policy.conditions).toContainEqual(['content-length-range', png.length, png.length]);
    expect(Date.parse(plan.expiresAt) - Date.now()).toBeGreaterThan(290_000);
    expect((await transfer(plan, Buffer.concat([png, Buffer.from('extra')]))).ok).toBe(false);
    expect((await transfer(plan)).status).toBe(204);
    const replies = await Promise.all([
      state.owner.post(`/api/post-media/${plan.id}/complete`).set('Origin', origin),
      state.owner.post(`/api/post-media/${plan.id}/complete`).set('Origin', origin),
    ]);
    expect(replies.map((reply) => reply.status)).toEqual([200, 200]);
    expect(replies.map((reply) => reply.body.id)).toEqual([plan.id, plan.id]);
    const file = await state.db.postMedia.findUniqueOrThrow({
      where: { id: plan.id },
      include: { object: true },
    });
    expect(file.uploadedAt).not.toBeNull();
    expect(file.bytes).toBeNull();
    expect(file.object?.key.startsWith(`${s3.config.keyPrefix}/objects/`)).toBe(true);
    // 확정은 앞부분 Range 읽기와 서버 쪽 복사로만 한다. 임시 객체 전체를 API로 내려받지 않는다.
    const staged = `/${s3.config.bucket}/${plan.fields.key}`;
    const reads = s3.requests.filter((request) => request.method === 'GET' && request.path === staged);
    expect(reads.length).toBeGreaterThan(0);
    expect(reads.every((request) => request.range === `bytes=0-${png.length - 1}`)).toBe(true);
    expect(s3.requests).toContainEqual(
      expect.objectContaining({ method: 'PUT', path: `/${s3.config.bucket}/${file.object?.key}` }),
    );
    expect(
      s3.requests.find((request) => request.path === `/${s3.config.bucket}/${file.object?.key}`)?.copySource,
    ).toContain(plan.fields.key);
    expect((await transfer(plan, Buffer.alloc(png.length, 120))).status).toBe(204);
    const redirected = await state.owner.get(`/api/post-media/${plan.id}`).expect(307);
    const location = new URL(responseLocation(redirected));
    expect(location.searchParams.get('X-Amz-Expires')).toBe('60');
    expect(location.searchParams.get('X-Amz-Signature')).toMatch(/^[a-f0-9]{64}$/);
    expect(location.searchParams.get('response-cache-control')).toBe('private, no-store');
    expect(redirected.headers['cache-control']).toBe('private, no-store');
    expect(Buffer.from(await (await fetch(location)).arrayBuffer())).toEqual(png);
    await state.outsider.get(`/api/post-media/${plan.id}`).expect(404);
    await state.owner.get(`/api/post-media/${plan.id}`).set('Range', 'bytes=999-1000').expect(416);
    const ranged = await state.owner.get(`/api/post-media/${plan.id}`).set('Range', 'bytes=8-11').expect(307);
    const bytes = await fetch(responseLocation(ranged), { headers: { Range: 'bytes=8-11' } });
    expect(bytes.status).toBe(206);
    expect(Buffer.from(await bytes.arrayBuffer())).toEqual(png.subarray(8, 12));
    const head = await state.owner.head(`/api/post-media/${plan.id}`).expect(200);
    expect(head.headers['content-length']).toBe(String(png.length));
    expect(head.headers.location).toBeUndefined();
    const post = (await publish(plan.id).expect(200)).body;
    await supertest(state.app.getHttpServer()).get(`/api/post-media/${plan.id}`).expect(307);
    await state.db.post.update({ where: { id: post.id }, data: { hidden: true } });
    await supertest(state.app.getHttpServer()).get(`/api/post-media/${plan.id}`).expect(404);
  });

  it('허위 형식과 만료된 예약을 확정하지 않고 하루 지난 임시 객체를 정리해야 한다', async () => {
    const invalid = await reserve();
    expect((await transfer(invalid, Buffer.alloc(png.length, 120))).status).toBe(204);
    await state.owner.post(`/api/post-media/${invalid.id}/complete`).set('Origin', origin).expect(400);
    expect((await state.db.postMedia.findUniqueOrThrow({ where: { id: invalid.id } })).uploadedAt).toBeNull();
    await state.owner.get(`/api/post-media/${invalid.id}`).expect(404);
    // 서명이 만료된 직후에 끝난 전송은 유예 시간 안이라 확정한다.
    const late = await reserve();
    expect((await transfer(late)).status).toBe(204);
    await state.db.postMedia.update({
      where: { id: late.id },
      data: { createdAt: new Date(Date.now() - (MEDIA_UPLOAD_TTL_SECONDS + 1) * 1000) },
    });
    await state.owner.post(`/api/post-media/${late.id}/complete`).set('Origin', origin).expect(200);
    const expired = await reserve();
    await state.db.postMedia.update({
      where: { id: expired.id },
      data: {
        createdAt: new Date(
          Date.now() - (MEDIA_UPLOAD_TTL_SECONDS + MEDIA_COMPLETE_GRACE_SECONDS + 1) * 1000,
        ),
      },
    });
    await state.owner.post(`/api/post-media/${expired.id}/complete`).set('Origin', origin).expect(409);
    const old = new Date(Date.now() - 2 * 86_400_000);
    const row = await state.db.postMedia.update({ where: { id: invalid.id }, data: { createdAt: old } });
    await state.db.mediaObject.update({ where: { id: row.objectId ?? '' }, data: { createdAt: old } });
    const result = await state.app.get(MediaStorage).prune();
    expect(result.failed).toBe(0);
    expect(result.removed).toBe(1);
    expect(await s3.exists(invalid.fields.key ?? '')).toBe(false);
  });

  it('S3 배포는 multipart 수신을 막고 검증 뒤 바뀐 임시 객체를 확정하지 않아야 한다', async () => {
    await state.owner
      .post('/api/post-media')
      .set('Origin', origin)
      .attach('file', png, { filename: 'image.png', contentType: 'image/png' })
      .expect(404);
    const plan = await reserve();
    expect((await transfer(plan)).status).toBe(204);
    s3.beforeCopy = (source) => s3.write(source, Buffer.alloc(png.length, 120), 'image/png');
    try {
      const changed = await state.owner
        .post(`/api/post-media/${plan.id}/complete`)
        .set('Origin', origin)
        .expect(409);
      expect(changed.body.errorCode).toBe('UPLOAD_CHANGED');
    } finally {
      s3.beforeCopy = undefined;
    }
    expect((await state.db.postMedia.findUniqueOrThrow({ where: { id: plan.id } })).uploadedAt).toBeNull();
  });
});
