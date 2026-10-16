import { randomBytes, randomUUID } from 'node:crypto';
import { createRequire } from 'node:module';
import { spawnSync } from 'node:child_process';
import type { AddressInfo } from 'node:net';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import supertest from 'supertest';
import type { INestApplication } from '@nestjs/common';
import { PrismaClient } from './generated/prisma';
import { createApp } from './app';
import { seed } from './seed';
import { assertDatabaseUrl, COOKIE, hash } from './security';

const testDatabaseUrl = process.env.TEST_DATABASE_URL;
const origin = 'http://localhost:3300';
const require = createRequire(import.meta.url);
type Actor = { id: string; agent: ReturnType<typeof supertest.agent>; cookie: string };
type Message = { id: string; body: string; clientMessageId: string; conversationId: string };

async function within<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  let timer: ReturnType<typeof setTimeout>;
  try {
    return await Promise.race([
      promise,
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new Error(`Timed out waiting for ${label}`)), ms);
      }),
    ]);
  } finally {
    clearTimeout(timer!);
  }
}

describe.skipIf(!testDatabaseUrl)('private persistent 1:1 chat with isolated PostgreSQL', () => {
  let app: INestApplication, db: PrismaClient, databaseUrl: string, schema: string, baseUrl: string;
  let alice: Actor, bob: Actor, outsider: Actor, conversationId: string;
  const extraApps: INestApplication[] = [];
  const streams = new Set<AbortController>();

  async function login(nickname: string): Promise<Actor> {
    const agent = supertest.agent(app.getHttpServer());
    const response = await agent.post('/api/auth/demo').set('Origin', origin).send({ nickname }).expect(200);
    const cookies = response.headers['set-cookie'] as unknown as string[];
    return {
      id: response.body.user.id,
      agent,
      cookie: cookies.map((cookie) => cookie.split(';')[0]).join('; '),
    };
  }
  const send = (actor: Actor, id: string, body: string, clientMessageId = randomUUID()) =>
    actor.agent
      .post(`/api/conversations/${id}/messages`)
      .set('Origin', origin)
      .send({ body, clientMessageId });
  const read = (actor: Actor, id: string, messageId: string) =>
    actor.agent.post(`/api/conversations/${id}/read`).set('Origin', origin).send({ messageId });

  async function stream(actor: Actor) {
    const abort = new AbortController();
    streams.add(abort);
    const response = await within(
      fetch(`${baseUrl}/api/chat/events`, {
        headers: { Cookie: actor.cookie },
        signal: abort.signal,
      }),
      3000,
      'SSE response',
    );
    expect(response.status).toBe(200);
    expect(response.headers.get('content-type')).toContain('text/event-stream');
    const reader = response.body!.getReader();
    const decoder = new TextDecoder();
    let pending = '';
    async function nextInvalidate() {
      for (;;) {
        const boundary = pending.indexOf('\n\n');
        if (boundary >= 0) {
          const frame = pending.slice(0, boundary);
          pending = pending.slice(boundary + 2);
          const lines = frame.split('\n');
          if (
            lines
              .find((line) => line.startsWith('event:'))
              ?.slice(6)
              .trim() !== 'invalidate'
          )
            continue;
          return JSON.parse(
            lines
              .filter((line) => line.startsWith('data:'))
              .map((line) => line.slice(5).trim())
              .join('\n'),
          );
        }
        const chunk = await reader.read();
        if (chunk.done) throw new Error('SSE ended before the expected invalidation');
        pending += decoder.decode(chunk.value, { stream: true }).replaceAll('\r\n', '\n');
      }
    }
    async function ended() {
      for (;;) {
        if ((await reader.read()).done) return;
      }
    }
    expect(await within(nextInvalidate(), 3000, 'initial SSE invalidation')).toEqual({
      conversationId: null,
    });
    return {
      nextInvalidate,
      ended,
      close: () => {
        abort.abort();
        streams.delete(abort);
      },
    };
  }

  beforeAll(async () => {
    const target = new URL(testDatabaseUrl!);
    schema = `gf_test_chat_${randomBytes(8).toString('hex')}`;
    target.searchParams.set('schema', schema);
    databaseUrl = target.toString();
    // Validate before invoking any migration or creating a Prisma connection.
    assertDatabaseUrl(databaseUrl, 'test');
    const migration = spawnSync(
      process.execPath,
      [require.resolve('prisma/build/index.js'), 'migrate', 'deploy'],
      {
        env: { ...process.env, NODE_ENV: 'test', DATABASE_URL: databaseUrl },
        encoding: 'utf8',
      },
    );
    if (migration.status !== 0)
      throw new Error(`Isolated chat migration failed: ${migration.stderr}\n${migration.stdout}`);
    db = new PrismaClient({ datasources: { db: { url: databaseUrl } } });
    await seed(db, false);
    app = await createApp({ databaseUrl, webOrigin: origin, demoMode: true, rateLimit: false, prisma: db });
    await app.listen(0, '127.0.0.1');
    baseUrl = `http://127.0.0.1:${(app.getHttpServer().address() as AddressInfo).port}`;
    alice = await login('대화요청자');
    bob = await login('대화코치');
    outsider = await login('비참여자');
  }, 30000);

  afterAll(async () => {
    for (const controller of streams) controller.abort();
    await Promise.all(extraApps.map((application) => application.close()));
    await app?.close();
    if (db) {
      if (!/^gf_test_chat_[a-f0-9]+$/.test(schema)) throw new Error('Refusing to delete an unowned schema.');
      await db.$executeRawUnsafe(`DROP SCHEMA "${schema}" CASCADE`);
      await db.$disconnect();
    }
  }, 15000);

  it('requires a session, rejects self chat, and canonicalizes concurrent pair creation', async () => {
    await supertest(app.getHttpServer()).get('/api/conversations').expect(401);
    await supertest(app.getHttpServer()).get('/api/chat/events').expect(401);
    await alice.agent
      .post('/api/conversations')
      .set('Origin', origin)
      .send({ recipientId: alice.id })
      .expect(400);
    const responses = await Promise.all([
      alice.agent.post('/api/conversations').set('Origin', origin).send({ recipientId: bob.id }).expect(200),
      bob.agent.post('/api/conversations').set('Origin', origin).send({ recipientId: alice.id }).expect(200),
    ]);
    conversationId = responses[0].body.id;
    expect(responses[1].body.id).toBe(conversationId);
    expect(responses[0].body.peer.id).toBe(bob.id);
    expect(responses[1].body.peer.id).toBe(alice.id);
    expect((await alice.agent.get('/api/conversations')).body.items).toHaveLength(1);
    expect((await bob.agent.get('/api/conversations')).body.items).toHaveLength(1);
  });

  it('protects message reads, sends, and read receipts from nonparticipants', async () => {
    await outsider.agent.get(`/api/conversations/${conversationId}/messages`).expect(404);
    await send(outsider, conversationId, '참여자가 아닌 사용자의 메시지').expect(404);
    await read(outsider, conversationId, 'unavailable-message').expect(404);
    expect((await outsider.agent.get('/api/conversations')).body.items).toHaveLength(0);
  });

  it('persists messages and makes concurrent client retries idempotent', async () => {
    const clientMessageId = randomUUID();
    const responses = await Promise.all([
      send(alice, conversationId, '호그 덱 수비 타이밍을 같이 살펴볼까요?', clientMessageId).expect(200),
      send(alice, conversationId, '호그 덱 수비 타이밍을 같이 살펴볼까요?', clientMessageId).expect(200),
    ]);
    expect(responses[0].body.id).toBe(responses[1].body.id);
    expect(responses[0].body.clientMessageId).toBe(clientMessageId);
    const reloaded = (await bob.agent.get(`/api/conversations/${conversationId}/messages`).expect(200)).body;
    expect(reloaded.items).toHaveLength(1);
    expect(reloaded.items[0].id).toBe(responses[0].body.id);
    expect(reloaded.conversation.unreadCount).toBe(1);
    await send(alice, conversationId, '같은 식별자의 본문을 바꿀 수는 없습니다.', clientMessageId).expect(
      409,
    );

    const other = (
      await alice.agent
        .post('/api/conversations')
        .set('Origin', origin)
        .send({ recipientId: outsider.id })
        .expect(200)
    ).body;
    await send(alice, other.id, '호그 덱 수비 타이밍을 같이 살펴볼까요?', clientMessageId).expect(409);
    expect((await outsider.agent.get(`/api/conversations/${other.id}/messages`)).body.items).toHaveLength(0);
  });

  it('paginates persisted messages without overlapping adjacent pages', async () => {
    await send(bob, conversationId, '먼저 얼음 골렘의 이동 경로를 확인해 보세요.').expect(200);
    await send(alice, conversationId, '대포 위치도 함께 확인하고 싶어요.').expect(200);
    const first = (await alice.agent.get(`/api/conversations/${conversationId}/messages?limit=2`).expect(200))
      .body;
    expect(first.items).toHaveLength(2);
    expect(first.nextCursor).toBeTypeOf('string');
    const second = (
      await alice.agent
        .get(`/api/conversations/${conversationId}/messages`)
        .query({ limit: 2, cursor: first.nextCursor })
        .expect(200)
    ).body;
    expect(second.items).toHaveLength(1);
    expect(first.items.map((message: Message) => message.id)).not.toContain(second.items[0].id);
  });

  it('reads only through the supplied boundary and never rolls it backward', async () => {
    const boundary = (await send(alice, conversationId, '이 메시지까지 화면에서 확인했습니다.').expect(200))
      .body;
    const newer = (
      await send(alice, conversationId, '읽음 요청 직전에 새로 도착한 메시지입니다.').expect(200)
    ).body;
    await bob.agent
      .post(`/api/conversations/${conversationId}/read`)
      .set('Origin', origin)
      .send({})
      .expect(400);
    await read(bob, conversationId, boundary.id).expect(200);
    const afterBoundary = (await bob.agent.get(`/api/conversations/${conversationId}/messages`)).body;
    expect(afterBoundary.conversation.unreadCount).toBe(1);
    await read(bob, conversationId, afterBoundary.items.at(-1).id).expect(200);
    expect(
      (await bob.agent.get('/api/conversations')).body.items.find(
        (item: { id: string }) => item.id === conversationId,
      ).unreadCount,
    ).toBe(1);
    await read(bob, conversationId, newer.id).expect(200);
    expect(
      (await bob.agent.get('/api/conversations')).body.items.find(
        (item: { id: string }) => item.id === conversationId,
      ).unreadCount,
    ).toBe(0);
    const other = (
      await alice.agent
        .post('/api/conversations')
        .set('Origin', origin)
        .send({ recipientId: outsider.id })
        .expect(200)
    ).body;
    const foreignMessage = (await send(alice, other.id, '다른 대화방의 읽음 경계입니다.').expect(200)).body;
    await read(bob, conversationId, foreignMessage.id).expect(404);
  });

  it('applies blocks in both directions to listing, creation, send and read', async () => {
    await alice.agent.post('/api/blocks').set('Origin', origin).send({ blockedUserId: bob.id }).expect(200);
    for (const actor of [alice, bob]) {
      expect(
        (await actor.agent.get('/api/conversations')).body.items.some(
          (item: { id: string }) => item.id === conversationId,
        ),
      ).toBe(false);
      await actor.agent.get(`/api/conversations/${conversationId}/messages`).expect(404);
      await send(actor, conversationId, '차단 관계에서는 전송할 수 없습니다.').expect(404);
      await read(actor, conversationId, 'unavailable-message').expect(404);
    }
    await bob.agent
      .post('/api/conversations')
      .set('Origin', origin)
      .send({ recipientId: alice.id })
      .expect(404);
    await alice.agent
      .post('/api/conversations')
      .set('Origin', origin)
      .send({ recipientId: bob.id })
      .expect(404);
    await alice.agent.delete(`/api/blocks/${bob.id}`).set('Origin', origin).expect(200);
    await bob.agent.get(`/api/conversations/${conversationId}/messages`).expect(200);
  });

  it('hides demo participants and their conversations from normal mode', async () => {
    const real = await db.user.create({
      data: {
        googleSubject: 'chat-real-google-sub',
        nickname: '실제로그인사용자',
        termsVersion: 'test',
        ageConfirmed: true,
      },
    });
    const raw = randomUUID();
    await db.session.create({
      data: { userId: real.id, tokenHash: hash(raw), expiresAt: new Date(Date.now() + 60000) },
    });
    const realCookie = `${COOKIE}=${raw}`;
    const existing = (
      await supertest(app.getHttpServer())
        .post('/api/conversations')
        .set('Cookie', realCookie)
        .set('Origin', origin)
        .send({ recipientId: alice.id })
        .expect(200)
    ).body;
    const normal = await createApp({
      databaseUrl,
      webOrigin: origin,
      demoMode: false,
      rateLimit: false,
      prisma: db,
    });
    extraApps.push(normal);
    const request = supertest(normal.getHttpServer());
    expect(
      (await request.get('/api/conversations').set('Cookie', realCookie).expect(200)).body.items,
    ).toHaveLength(0);
    await request
      .post('/api/conversations')
      .set('Cookie', realCookie)
      .set('Origin', origin)
      .send({ recipientId: alice.id })
      .expect(404);
    await request.get(`/api/conversations/${existing.id}/messages`).set('Cookie', realCookie).expect(404);
  });

  it('delivers participant invalidations without message contents and closes on logout', async () => {
    const events = await stream(bob);
    await send(alice, conversationId, 'SSE 이벤트에는 이 비공개 본문이 포함되지 않습니다.').expect(200);
    expect(await within(events.nextInvalidate(), 3000, 'participant SSE invalidation')).toEqual({
      conversationId,
    });
    await bob.agent.post('/api/auth/logout').set('Origin', origin).expect(200);
    await within(events.ended(), 7500, 'SSE close after logout');
    events.close();
  }, 12000);

  it('closes a connected stream when its session expires', async () => {
    const events = await stream(outsider);
    await db.session.updateMany({
      where: { userId: outsider.id },
      data: { expiresAt: new Date(Date.now() - 1000) },
    });
    await within(events.ended(), 7500, 'SSE close after session expiration');
    events.close();
  }, 12000);

  it('removes private conversations and disconnects streams when a participant deletes the account', async () => {
    bob = await login('대화코치');
    const events = await stream(bob);
    await bob.agent.delete('/api/me').set('Origin', origin).expect(200);
    await within(events.ended(), 7500, 'SSE close after account deletion');
    events.close();
    await alice.agent.get(`/api/conversations/${conversationId}/messages`).expect(404);
    const remaining = (await alice.agent.get('/api/conversations')).body;
    expect(remaining.items.some((item: { id: string }) => item.id === conversationId)).toBe(false);
    expect(JSON.stringify(remaining)).not.toContain('대화코치');
    expect((await bob.agent.get('/api/session')).body.user).toBeNull();
  }, 12000);
});
