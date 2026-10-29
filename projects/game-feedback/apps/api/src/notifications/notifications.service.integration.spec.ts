import { spawnSync } from 'node:child_process';
import { randomBytes, randomUUID } from 'node:crypto';
import { createRequire } from 'node:module';

import type { INestApplication } from '@nestjs/common';
import supertest from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import {
  ChatMessageSchema,
  ConversationSchema,
  NotificationListSchema,
  PostSchema,
  SessionSchema,
} from '@game-feedback/contracts';

import { createApp } from '../app';
import { assertDatabaseUrl } from '../database/database-url';
import { createPrismaAdapter } from '../database/prisma-adapter';
import { PrismaClient } from '../generated/prisma';
import { seed } from '../seed';

const require = createRequire(import.meta.url);
const origin = 'http://localhost:3300';
type TAgent = ReturnType<typeof supertest.agent>;

describe('게시물과 채팅의 통합 알림', () => {
  let app: INestApplication;
  let db: PrismaClient;
  const schema = `gf_test_chat_notifications_${randomBytes(8).toString('hex')}`;
  beforeAll(async () => {
    const url = new URL(process.env.DATABASE_URL ?? '');
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
    if (!/^gf_test_chat_notifications_[a-f0-9]{16}$/.test(schema))
      throw new Error('알림 테스트 스키마가 아니다');
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
  const list = async (agent: TAgent, query: { cursor?: string; limit?: number } = {}) =>
    NotificationListSchema.parse((await agent.get('/api/notifications').query(query).expect(200)).body);

  it('새 메시지는 상대에게 한 번만 알리고 원문은 알림에 포함하지 않아야 한다', async () => {
    const { sender, recipient, room } = await setup('채팅중복');
    const requestId = randomUUID();
    const message = await send(sender.agent, room.id, requestId);
    await send(sender.agent, room.id, requestId);
    const inbox = await list(recipient.agent);
    expect(inbox).toMatchObject({
      unreadCount: 1,
      items: [
        {
          type: 'CHAT_MESSAGE',
          conversationId: room.id,
          postId: null,
          postTitle: null,
          actor: { id: sender.id },
        },
      ],
    });
    expect(JSON.stringify(inbox)).not.toContain('채팅 비밀 본문');
    expect(await db.chatNotification.count({ where: { messageId: message.id } })).toBe(1);
    expect((await list(sender.agent)).items).toEqual([]);
    const outsider = await login('채팅알림외부인');
    const notice = inbox.items[0];
    if (!notice) throw new Error('상대방에게 알림이 있어야 한다');
    await outsider.agent.post(`/api/notifications/${notice.id}/read`).set('Origin', origin).expect(404);
  });

  it('실제 채팅 읽음은 알림에도 반영하고 알림 모두 읽음은 채팅 메시지를 읽은 것으로 만들지 않아야 한다', async () => {
    const { sender, recipient, room } = await setup('채팅읽음');
    const first = await send(sender.agent, room.id),
      second = await send(sender.agent, room.id);
    expect((await recipient.agent.get('/api/conversations')).body.unreadCount).toBe(2);
    await recipient.agent
      .post(`/api/conversations/${room.id}/read`)
      .set('Origin', origin)
      .send({ messageId: first.id })
      .expect(200);
    expect((await list(recipient.agent)).unreadCount).toBe(1);
    await recipient.agent.post('/api/notifications/read-all').set('Origin', origin).expect(200);
    expect((await list(recipient.agent)).unreadCount).toBe(0);
    expect((await recipient.agent.get('/api/conversations')).body.unreadCount).toBe(1);
    await recipient.agent
      .post(`/api/conversations/${room.id}/read`)
      .set('Origin', origin)
      .send({ messageId: second.id })
      .expect(200);
    expect((await recipient.agent.get('/api/conversations')).body.unreadCount).toBe(0);
    const third = await send(sender.agent, room.id);
    await recipient.agent
      .delete(`/api/conversations/${room.id}/messages`)
      .set('Origin', origin)
      .send({ throughMessageId: second.id })
      .expect(200);
    expect((await list(recipient.agent)).items).toHaveLength(1);
    await recipient.agent
      .delete(`/api/conversations/${room.id}/messages`)
      .set('Origin', origin)
      .send({ throughMessageId: third.id })
      .expect(200);
    expect((await list(recipient.agent)).items).toEqual([]);
  });

  it('게시물과 채팅 알림을 섞어도 커서 페이지에 누락·중복이 없어야 한다', async () => {
    const { sender, recipient, room } = await setup('알림페이지');
    const category = await db.category.findFirstOrThrow({ where: { active: true } });
    const post = PostSchema.parse(
      (
        await recipient.agent
          .post('/api/posts')
          .set('Origin', origin)
          .send({
            categoryId: category.id,
            board: 'FREE',
            title: '통합 알림 게시물',
            body: '게시물과 채팅의 알림을 함께 확인합니다.',
          })
          .expect(200)
      ).body,
    );
    for (let index = 0; index < 3; index++) {
      await send(sender.agent, room.id);
      await sender.agent
        .post(`/api/posts/${post.id}/comments`)
        .set('Origin', origin)
        .send({ body: `혼합 알림 ${index}` })
        .expect(200);
    }
    const ids: string[] = [];
    let cursor: string | undefined;
    do {
      const page = await list(recipient.agent, { limit: 2, ...(cursor ? { cursor } : {}) });
      expect(page.unreadCount).toBe(6);
      ids.push(...page.items.map(({ id }) => id));
      cursor = page.nextCursor ?? undefined;
    } while (cursor);
    expect(ids).toHaveLength(6);
    expect(new Set(ids).size).toBe(6);
  });

  it('차단한 상대의 채팅 알림은 목록과 미읽음 개수에서 제외해야 한다', async () => {
    const { sender, recipient, room } = await setup('알림차단');
    await send(sender.agent, room.id);
    expect((await list(recipient.agent)).unreadCount).toBe(1);
    await recipient.agent
      .post('/api/blocks')
      .set('Origin', origin)
      .send({ blockedUserId: sender.id })
      .expect(200);
    expect(await list(recipient.agent)).toMatchObject({ items: [], unreadCount: 0 });
  });
});
