import { spawnSync } from 'node:child_process';
import { randomBytes, randomUUID } from 'node:crypto';
import { createRequire } from 'node:module';

import type { INestApplication } from '@nestjs/common';
import supertest from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { ChatMessageSchema, ConversationSchema, SessionSchema } from '@game-feedback/contracts';
import { ExpoPushTransport, type IPushMessage } from '@side/push-notifications';

import { createApp } from '../app';
import { assertDatabaseUrl } from '../database/database-url';
import { createPrismaAdapter } from '../database/prisma-adapter';
import { PrismaClient } from '../generated/prisma';
import { PushService } from '../push/push.service';
import { seed } from '../seed';

const require = createRequire(import.meta.url);
const origin = 'http://localhost:3300';
type TAgent = ReturnType<typeof supertest.agent>;

describe('세션에 연결한 앱 푸시', () => {
  let app: INestApplication;
  let db: PrismaClient;
  const schema = `gf_test_push_${randomBytes(8).toString('hex')}`;
  beforeAll(async () => {
    const url = new URL(process.env.TEST_DATABASE_URL ?? '');
    url.searchParams.set('schema', schema);
    const databaseUrl = assertDatabaseUrl(url.toString(), 'test');
    const result = spawnSync(
      process.execPath,
      [require.resolve('prisma/build/index.js'), 'migrate', 'deploy'],
      { env: { ...process.env, NODE_ENV: 'test', DATABASE_URL: databaseUrl }, encoding: 'utf8' },
    );
    if (result.status !== 0) throw new Error(`알림 테스트 스키마 준비 실패: ${result.stderr}`);
    db = new PrismaClient({ adapter: createPrismaAdapter(databaseUrl) });
    await seed(db, false);
    app = await createApp({ databaseUrl, webOrigin: origin, demoMode: true, rateLimit: false, prisma: db });
  }, 30000);
  afterAll(async () => {
    await app?.close();
    if (!db) return;
    if (!/^gf_test_push_[a-f0-9]{16}$/.test(schema)) throw new Error('알림 테스트 스키마가 아니다');
    await db.$executeRawUnsafe(`DROP SCHEMA "${schema}" CASCADE`);
    await db.$disconnect();
  });

  const login = async (nickname: string) => {
    const agent = supertest.agent(app.getHttpServer());
    const response = await agent.post('/api/auth/demo').set('Origin', origin).send({ nickname }).expect(200);
    const { user } = SessionSchema.parse(response.body);
    if (!user) throw new Error('테스트 사용자가 필요하다');
    return { agent, id: user.id };
  };
  const setup = async (name: string) => {
    const sender = await login(`${name}발신자`),
      recipient = await login(`${name}수신자`);
    const room = ConversationSchema.parse(
      (
        await sender.agent
          .post('/api/conversations')
          .set('Origin', origin)
          .send({ recipientId: recipient.id })
          .expect(200)
      ).body,
    );
    return { sender, recipient, room };
  };
  const send = async (agent: TAgent, id: string, clientMessageId = randomUUID()) =>
    ChatMessageSchema.parse(
      (
        await agent
          .post(`/api/conversations/${id}/messages`)
          .set('Origin', origin)
          .send({ body: '채팅 비밀 본문', clientMessageId })
          .expect(200)
      ).body,
    );
  const register = async (
    agent: TAgent,
    installationId = randomUUID(),
    token = `ExpoPushToken[${randomUUID().replaceAll('-', '')}]`,
  ) => {
    await agent
      .post('/api/push/devices/register')
      .set('Origin', origin)
      .send({ installationId, token, platform: 'ios', locale: 'ko' })
      .expect(200);
    return installationId;
  };
  const run = async () => {
    const messages: IPushMessage[] = [];
    const transport = new ExpoPushTransport({
      fetch: async (_url, options) => {
        const batch = JSON.parse(String(options?.body)) as IPushMessage[];
        messages.push(...batch);
        return Response.json({
          data: batch.map((_item, index) => ({ status: 'ok', id: `ticket-${index}` })),
        });
      },
    });
    await app.get(PushService).runOnce(transport);
    return messages;
  };

  it('등록은 세션·Origin·DTO를 검사하고 로그아웃하면 기기와 대기 전송도 함께 제거해야 한다', async () => {
    const { sender, recipient, room } = await setup('푸시세션');
    await supertest(app.getHttpServer())
      .post('/api/push/devices/register')
      .set('Origin', origin)
      .send({})
      .expect(401);
    await recipient.agent
      .post('/api/push/devices/register')
      .set('Origin', 'https://evil.example')
      .send({})
      .expect(403);
    await recipient.agent
      .post('/api/push/devices/register')
      .set('Origin', origin)
      .send({ installationId: randomUUID(), token: 'bad', platform: 'ios', locale: 'ko' })
      .expect(400);
    const id = await register(recipient.agent);
    await send(sender.agent, room.id);
    expect(await db.pushDelivery.count({ where: { deviceId: id } })).toBe(1);
    await recipient.agent.post('/api/auth/logout').set('Origin', origin).expect(200);
    expect(await db.pushDevice.findUnique({ where: { id } })).toBeNull();
    expect(await db.pushDelivery.count({ where: { deviceId: id } })).toBe(0);
    expect(await run()).toEqual([]);
  });

  it('동일 메시지 재요청은 한 번만 큐에 넣고 푸시에 원문이나 닉네임을 넣지 않아야 한다', async () => {
    const { sender, recipient, room } = await setup('푸시중복');
    const id = await register(recipient.agent);
    const requestId = randomUUID();
    await send(sender.agent, room.id, requestId);
    await send(sender.agent, room.id, requestId);
    const messages = await run();
    expect(messages).toHaveLength(1);
    expect(messages[0]).toMatchObject({ badge: 1, data: { path: '/ko/notifications' }, sound: 'default' });
    expect(JSON.stringify(messages)).not.toContain('채팅 비밀 본문');
    expect(JSON.stringify(messages)).not.toContain('발신자');
    expect(await db.pushDelivery.count({ where: { deviceId: id, status: 'TICKET' } })).toBe(1);
    expect(await run()).toEqual([]);
    await db.pushDevice.delete({ where: { id } });
  });

  it('이미 읽었거나 차단한 상대의 알림은 전송 직전에 취소해야 한다', async () => {
    const { sender, recipient, room } = await setup('푸시읽음차단');
    const id = await register(recipient.agent);
    await send(sender.agent, room.id);
    await recipient.agent.post('/api/notifications/read-all').set('Origin', origin).expect(200);
    expect(await run()).toEqual([]);
    await send(sender.agent, room.id);
    await recipient.agent
      .post('/api/blocks')
      .set('Origin', origin)
      .send({ blockedUserId: sender.id })
      .expect(200);
    expect(await run()).toEqual([]);
    expect(await db.pushDelivery.count({ where: { deviceId: id, status: 'CANCELLED' } })).toBe(2);
    await db.pushDevice.delete({ where: { id } });
  });

  it('같은 기기를 다른 계정에 연결하면 이전 계정의 대기 전송을 없애고 다른 세션은 해제할 수 없어야 한다', async () => {
    const { sender, recipient, room } = await setup('푸시계정전환');
    const id = await register(recipient.agent);
    await send(sender.agent, room.id);
    const other = await login('푸시다른계정');
    await other.agent
      .post('/api/push/devices/unregister')
      .set('Origin', origin)
      .send({ installationId: id })
      .expect(200);
    expect(await db.pushDevice.findUnique({ where: { id } })).toMatchObject({ userId: recipient.id });
    await register(other.agent, id);
    expect(await db.pushDevice.findUnique({ where: { id } })).toMatchObject({ userId: other.id });
    expect(await db.pushDelivery.count({ where: { deviceId: id } })).toBe(0);
    expect(await run()).toEqual([]);
    await db.pushDevice.delete({ where: { id } });
  });

  it('만료된 세션으로 보낼 수 없고 팔로우한 사용자의 새 글도 같은 큐에 기록해야 한다', async () => {
    const { sender, recipient, room } = await setup('푸시팔로우');
    const id = await register(recipient.agent);
    await db.userFollow.create({ data: { followerId: recipient.id, followingId: sender.id } });
    const category = await db.category.findFirstOrThrow();
    await sender.agent
      .post('/api/posts')
      .set('Origin', origin)
      .send({ categoryId: category.id, title: '푸시 팔로우 글', body: '비공개 잠금화면 본문 제외' })
      .expect(200);
    expect(await db.pushDelivery.count({ where: { deviceId: id, eventId: { startsWith: 'post:' } } })).toBe(
      1,
    );
    const device = await db.pushDevice.findUniqueOrThrow({ where: { id } });
    await send(sender.agent, room.id);
    await db.session.update({ where: { id: device.sessionKey }, data: { expiresAt: new Date(0) } });
    expect(await run()).toEqual([]);
    expect(await db.pushDevice.findUnique({ where: { id } })).toBeNull();
  });
});
