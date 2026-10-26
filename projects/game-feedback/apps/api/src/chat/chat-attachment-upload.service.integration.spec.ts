import { spawnSync } from 'node:child_process';
import { randomBytes, randomUUID } from 'node:crypto';
import { createRequire } from 'node:module';

import type { INestApplication } from '@nestjs/common';
import supertest from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { MediaUploadPlanSchema } from '@game-feedback/contracts';

import { createApp } from '../app';
import { createPrismaAdapter } from '../database/prisma-adapter';
import { PrismaClient } from '../generated/prisma';
import { assertDatabaseUrl } from '../security';
import { seed } from '../seed';
import { responseLocation } from '../testing/http-response';
import { S3TestStorage } from '../testing/s3';

const require = createRequire(import.meta.url);
const origin = 'http://localhost:3300';
const schema = `gf_test_chat_media_${randomBytes(8).toString('hex')}`;
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

describe('채팅 S3 직접 업로드와 권한 조회', () => {
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
      if (!/^gf_test_chat_media_[a-f0-9]{16}$/.test(schema)) throw new Error('Unowned schema');
      await state.db.$executeRawUnsafe(`DROP SCHEMA "${schema}" CASCADE`);
      await state.db.$disconnect();
    }
    await s3.close();
  });
  async function room() {
    const peer = (await state.outsider.get('/api/session').expect(200)).body.user;
    return (
      await state.owner
        .post('/api/conversations')
        .set('Origin', origin)
        .send({ recipientId: peer.id })
        .expect(200)
    ).body;
  }
  async function reserve(id: string) {
    const response = await state.owner
      .post(`/api/conversations/${id}/attachments/uploads`)
      .set('Origin', origin)
      .send({ name: '채팅.png', mimeType: 'image/png', size: png.length })
      .expect(200);
    const plan = MediaUploadPlanSchema.parse(response.body);
    return plan;
  }
  async function transfer(plan: TDirectPlan, bytes: Buffer = png) {
    const body = new FormData();
    Object.entries(plan.fields).forEach(([key, value]) => body.append(key, value));
    body.append('file', new Blob([Uint8Array.from(bytes)], { type: 'image/png' }), '채팅.png');
    return fetch(plan.url, { method: 'POST', body });
  }
  it('참여자만 예약·확정할 수 있고 미완료 파일을 메시지에 연결할 수 없어야 한다', async () => {
    const conversation = await room();
    const path = `/api/conversations/${conversation.id}/attachments`;
    await supertest(state.app.getHttpServer())
      .post(`${path}/uploads`)
      .set('Origin', origin)
      .send({})
      .expect(401);
    const foreign = supertest.agent(state.app.getHttpServer());
    await foreign
      .post('/api/auth/demo')
      .set('Origin', origin)
      .send({ nickname: '참여하지 않은 사용자' })
      .expect(200);
    await foreign.post(`${path}/uploads`).set('Origin', origin).send({}).expect(404);
    await state.owner.post(`${path}/uploads`).set('Origin', 'https://foreign.test').send({}).expect(403);
    const plan = await reserve(conversation.id);
    const filePath = `${path}/${plan.id}`;
    await state.owner.get(filePath).expect(404);
    await state.owner.post(`${filePath}/complete`).set('Origin', origin).expect(400);
    await state.outsider.post(`${filePath}/complete`).set('Origin', origin).expect(404);
    await foreign.post(`${filePath}/complete`).set('Origin', origin).expect(404);
    await state.owner
      .post(`/api/conversations/${conversation.id}/messages`)
      .set('Origin', origin)
      .send({ body: '', attachmentIds: [plan.id], clientMessageId: randomUUID() })
      .expect(400);
    const message = (
      await state.owner
        .post(`/api/conversations/${conversation.id}/messages`)
        .set('Origin', origin)
        .send({ body: '미완료 첨부 DB 제약 검사', clientMessageId: randomUUID() })
        .expect(200)
    ).body;
    await expect(
      state.db.chatAttachment.update({ where: { id: plan.id }, data: { messageId: message.id } }),
    ).rejects.toThrow();
    await state.owner.delete(filePath).set('Origin', origin).expect(200);
  });

  it('직접 전송한 채팅 파일은 보이는 메시지의 참여자에게만 짧은 조회 주소를 발급해야 한다', async () => {
    const conversation = await room();
    const path = `/api/conversations/${conversation.id}/attachments`;
    const plan = await reserve(conversation.id);
    expect((await transfer(plan)).status).toBe(204);
    const completed = await Promise.all([
      state.owner.post(`${path}/${plan.id}/complete`).set('Origin', origin),
      state.owner.post(`${path}/${plan.id}/complete`).set('Origin', origin),
    ]);
    expect(completed.map((response) => response.status)).toEqual([200, 200]);
    const file = completed[0]?.body;
    expect(file.url).toBe(`${path}/${plan.id}`);
    await state.outsider.get(file.url).expect(404);
    await state.owner.get(file.url).expect(307);
    expect((await transfer(plan, Buffer.alloc(png.length, 120))).status).toBe(204);
    const message = (
      await state.owner
        .post(`/api/conversations/${conversation.id}/messages`)
        .set('Origin', origin)
        .send({ body: '', attachmentIds: [file.id], clientMessageId: randomUUID() })
        .expect(200)
    ).body;
    const content = await state.outsider.get(file.url).expect(307);
    const signed = new URL(responseLocation(content));
    expect(signed.searchParams.get('X-Amz-Expires')).toBe('60');
    expect(content.headers['cache-control']).toBe('private, no-store');
    expect(Buffer.from(await (await fetch(signed)).arrayBuffer())).toEqual(png);
    const ranged = await state.outsider.get(file.url).set('Range', 'bytes=8-11').expect(307);
    const bytes = await fetch(responseLocation(ranged), { headers: { Range: 'bytes=8-11' } });
    expect(bytes.status).toBe(206);
    expect(Buffer.from(await bytes.arrayBuffer())).toEqual(png.subarray(8, 12));
    const head = await state.outsider.head(file.url).expect(200);
    expect(head.headers['content-length']).toBe(String(png.length));
    expect(head.headers.location).toBeUndefined();
    await state.outsider.get(file.url).set('Range', 'bytes=999-1000').expect(416);
    await supertest(state.app.getHttpServer()).get(file.url).expect(401);
    await state.owner
      .delete(`/api/conversations/${conversation.id}/messages`)
      .set('Origin', origin)
      .send({ throughMessageId: message.id })
      .expect(200);
    await state.owner.get(file.url).expect(404);
    await state.outsider.get(file.url).expect(307);
    const peer = (await state.outsider.get('/api/session').expect(200)).body.user;
    await state.owner.post('/api/blocks').set('Origin', origin).send({ blockedUserId: peer.id }).expect(200);
    await state.outsider.get(file.url).expect(404);
    await state.owner.post(`${path}/uploads`).set('Origin', origin).send({}).expect(404);
    await state.owner.delete(`/api/blocks/${peer.id}`).set('Origin', origin).expect(200);
  });

  it('허위 파일과 만료된 채팅 업로드를 확정하지 않아야 한다', async () => {
    const conversation = await room();
    const path = `/api/conversations/${conversation.id}/attachments`;
    const invalid = await reserve(conversation.id);
    expect((await transfer(invalid, Buffer.alloc(png.length, 120))).status).toBe(204);
    await state.owner.post(`${path}/${invalid.id}/complete`).set('Origin', origin).expect(400);
    const expired = await reserve(conversation.id);
    await state.db.chatAttachment.update({
      where: { id: expired.id },
      data: { createdAt: new Date(Date.now() - 301_000) },
    });
    await state.owner.post(`${path}/${expired.id}/complete`).set('Origin', origin).expect(409);
    await state.owner.get(`${path}/${invalid.id}`).expect(404);
    await state.owner.get(`${path}/${expired.id}`).expect(404);
  });
});
