import { spawnSync } from 'node:child_process';
import { randomBytes, randomUUID } from 'node:crypto';
import { createRequire } from 'node:module';
import type { AddressInfo } from 'node:net';

import type { INestApplication } from '@nestjs/common';
import supertest from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { createApp } from '../app';
import { createPrismaAdapter } from '../database/prisma-adapter';
import { PrismaClient } from '../generated/prisma';
import { assertDatabaseUrl, COOKIE, hash } from '../security';
import { seed } from '../seed';
import { responseLocation } from '../testing/http-response';
import { presignedUpload } from '../testing/media-upload';

const testDatabaseUrl = process.env.DATABASE_URL;
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
    // Validate before applying the schema or creating a Prisma connection.
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
      throw new Error(`Isolated chat schema setup failed: ${migration.stderr}\n${migration.stdout}`);
    db = new PrismaClient({ adapter: createPrismaAdapter(databaseUrl) });
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

  it('shows an empty conversation only to the user who opened it until the first message', async () => {
    const starter = await login('빈대화시작자');
    const recipient = await login('빈대화상대방');
    const room = (
      await starter.agent
        .post('/api/conversations')
        .set('Origin', origin)
        .send({ recipientId: recipient.id })
        .expect(200)
    ).body;
    const ids = (body: { items: Array<{ id: string }> }) => body.items.map(({ id }) => id);
    expect(ids((await starter.agent.get('/api/conversations').expect(200)).body)).toEqual([room.id]);
    expect(ids((await recipient.agent.get('/api/conversations').expect(200)).body)).toEqual([]);
    await send(starter, room.id, '먼저 인사드려요.').expect(200);
    const inbox = (await recipient.agent.get('/api/conversations').expect(200)).body;
    expect(ids(inbox)).toEqual([room.id]);
    expect(inbox.unreadCount).toBe(1);
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
    const inbox = (await bob.agent.get('/api/conversations').expect(200)).body;
    expect(inbox.items.map((item: { id: string }) => item.id)).toEqual([conversationId]);
    expect(inbox.items[0]).toMatchObject({ unreadCount: 1, lastMessage: { id: responses[0].body.id } });
    expect(inbox.unreadCount).toBe(1);
    expect((await alice.agent.get('/api/conversations')).body.items[0]).toMatchObject({ unreadCount: 0 });
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

  it('uploads private media, authorizes draft access, attaches atomically and serves video ranges', async () => {
    const path = `/api/conversations/${conversationId}/attachments`;
    const png = Buffer.from(
      'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a53sAAAAASUVORK5CYII=',
      'base64',
    );
    await supertest(app.getHttpServer())
      .post(`${path}/uploads`)
      .set('Origin', origin)
      .send({ name: 'test.png', mimeType: 'image/png', size: png.length })
      .expect(401);
    await outsider.agent
      .post(`${path}/uploads`)
      .set('Origin', origin)
      .send({ name: 'test.png', mimeType: 'image/png', size: png.length })
      .expect(404);
    const image = (await presignedUpload(alice.agent, path, png, 'image/png', 'test.png')).body;
    expect(image).toMatchObject({ kind: 'IMAGE', mimeType: 'image/png', size: png.length });
    expect(image).not.toHaveProperty('bytes');
    await bob.agent.get(image.url).expect(404);
    const imageRedirect = await alice.agent.get(image.url).expect(307);
    expect((await fetch(responseLocation(imageRedirect))).headers.get('content-type')).toBe('image/png');
    const videoBytes = Buffer.concat([Buffer.from([0, 0, 0, 24]), Buffer.from('ftypisom00000000')]);
    const video = (await presignedUpload(alice.agent, path, videoBytes, 'video/mp4', 'practice.mp4')).body;
    expect(video.kind).toBe('VIDEO');
    await bob.agent
      .post(`/api/conversations/${conversationId}/messages`)
      .set('Origin', origin)
      .send({ body: '', attachmentIds: [image.id], clientMessageId: randomUUID() })
      .expect(400);
    const input = { body: '', attachmentIds: [image.id, video.id], clientMessageId: randomUUID() };
    const sent = (
      await alice.agent
        .post(`/api/conversations/${conversationId}/messages`)
        .set('Origin', origin)
        .send(input)
        .expect(200)
    ).body;
    expect(sent.attachments).toHaveLength(2);
    const retried = (
      await alice.agent
        .post(`/api/conversations/${conversationId}/messages`)
        .set('Origin', origin)
        .send(input)
        .expect(200)
    ).body;
    expect(retried.id).toBe(sent.id);
    await bob.agent.get(image.url).expect(307);
    await outsider.agent.get(image.url).expect(404);
    await supertest(app.getHttpServer()).get(video.url).expect(401);
    const redirect = await bob.agent.get(video.url).set('Range', 'bytes=0-7').expect(307);
    const partial = await fetch(responseLocation(redirect), { headers: { Range: 'bytes=0-7' } });
    expect(partial.status).toBe(206);
    expect(partial.headers.get('content-length')).toBe('8');
    expect(partial.headers.get('content-range')).toBe(`bytes 0-7/${videoBytes.length}`);
    await bob.agent.get(video.url).set('Range', 'bytes=999999-').expect(416);
    await alice.agent.delete(image.url).set('Origin', origin).expect(404);
    await alice.agent
      .post(`/api/conversations/${conversationId}/messages`)
      .set('Origin', origin)
      .send({ ...input, clientMessageId: randomUUID() })
      .expect(400);
  });
  it('rejects spoofed and oversized uploads and lets the uploader remove unsent files', async () => {
    const path = `/api/conversations/${conversationId}/attachments`;
    await presignedUpload(
      alice.agent,
      path,
      Buffer.from('<svg onload="alert(1)"/>'),
      'image/png',
      'image.png',
      400,
    );
    await alice.agent
      .post(`${path}/uploads`)
      .set('Origin', origin)
      .send({ name: 'large.mp4', mimeType: 'video/mp4', size: 25 * 1024 * 1024 + 1 })
      .expect(400);
    const png = Buffer.from(
      'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a53sAAAAASUVORK5CYII=',
      'base64',
    );
    const file = (await presignedUpload(alice.agent, path, png, 'image/png', 'remove.png')).body;
    await bob.agent.delete(file.url).set('Origin', origin).expect(404);
    await alice.agent.delete(file.url).set('Origin', origin).expect(200);
    await alice.agent.get(file.url).expect(404);
  });

  it('clears only the viewer history and unread count, keeps peer receipts and rejects unauthorized deletion', async () => {
    const owner = await login('기록삭제요청자');
    const peer = await login('기록삭제상대방');
    const room = (
      await owner.agent
        .post('/api/conversations')
        .set('Origin', origin)
        .send({ recipientId: peer.id })
        .expect(200)
    ).body;
    const old = (await send(owner, room.id, '내가 보낸 이전 메시지').expect(200)).body;
    const boundary = (await send(peer, room.id, '상대가 보낸 이전 메시지').expect(200)).body;
    const clear = (actor: Actor, messageId = boundary.id) =>
      actor.agent
        .delete(`/api/conversations/${room.id}/messages`)
        .set('Origin', origin)
        .send({ throughMessageId: messageId });
    await supertest(app.getHttpServer())
      .delete(`/api/conversations/${room.id}/messages`)
      .set('Origin', origin)
      .send({ throughMessageId: boundary.id })
      .expect(401);
    await clear(outsider).expect(404);
    await owner.agent
      .delete(`/api/conversations/${room.id}/messages`)
      .set('Origin', origin)
      .send({})
      .expect(400);
    await clear(owner, 'missing-message').expect(404);
    expect((await owner.agent.get('/api/conversations')).body.unreadCount).toBe(1);
    await clear(owner).expect(200);
    await clear(owner).expect(200);
    await clear(owner, old.id).expect(200);
    const after = (await owner.agent.get(`/api/conversations/${room.id}/messages`).expect(200)).body;
    expect(after.items).toEqual([]);
    expect(after.conversation).toMatchObject({ lastMessage: null, unreadCount: 0 });
    const inbox = (await owner.agent.get('/api/conversations').expect(200)).body;
    expect(inbox.items).toEqual([]);
    expect(inbox.unreadCount).toBe(0);
    const peerHistory = (await peer.agent.get(`/api/conversations/${room.id}/messages`).expect(200)).body;
    expect(peerHistory.items.map((message: Message) => message.id)).toEqual([boundary.id, old.id]);
    expect(peerHistory.conversation.unreadCount).toBe(1);
    const persisted = await db.chatConversation.findUniqueOrThrow({ where: { id: room.id } });
    expect(persisted.firstUserId === owner.id ? persisted.firstReadAt : persisted.secondReadAt).toBeNull();
    await read(owner, room.id, boundary.id).expect(404);
    await send(owner, room.id, old.body, old.clientMessageId).expect(409);
    await send(peer, room.id, '삭제 이후 다시 받은 메시지').expect(200);
    const restored = (await owner.agent.get('/api/conversations').expect(200)).body;
    expect(restored.items).toHaveLength(1);
    expect(restored.unreadCount).toBe(1);
    const newer = (await owner.agent.get(`/api/conversations/${room.id}/messages`).expect(200)).body;
    expect(newer.items).toHaveLength(1);
    expect(newer.items[0].body).toBe('삭제 이후 다시 받은 메시지');
  });

  it('keeps messages after the confirmed cutoff during concurrent sending and prevents a stale cursor from restoring history', async () => {
    const owner = await login('동시삭제요청자');
    const peer = await login('동시삭제상대방');
    const room = (
      await owner.agent
        .post('/api/conversations')
        .set('Origin', origin)
        .send({ recipientId: peer.id })
        .expect(200)
    ).body;
    const old = (await send(peer, room.id, '이전 페이지').expect(200)).body;
    const cutoff = (await send(peer, room.id, '확인한 마지막 메시지').expect(200)).body;
    const cursor = (await owner.agent.get(`/api/conversations/${room.id}/messages?limit=1`).expect(200)).body
      .nextCursor;
    expect(cursor).toBeTypeOf('string');
    const [newer] = await Promise.all([
      send(peer, room.id, '삭제 확인 중 도착한 메시지').expect(200),
      owner.agent
        .delete(`/api/conversations/${room.id}/messages`)
        .set('Origin', origin)
        .send({ throughMessageId: cutoff.id })
        .expect(200),
    ]);
    const visible = (await owner.agent.get(`/api/conversations/${room.id}/messages`).expect(200)).body;
    expect(visible.items.map((message: Message) => message.id)).toEqual([newer.body.id]);
    expect(visible.conversation.lastMessage.id).toBe(newer.body.id);
    expect((await owner.agent.get('/api/conversations')).body.unreadCount).toBe(1);
    expect(
      (await owner.agent.get(`/api/conversations/${room.id}/messages`).query({ cursor }).expect(200)).body
        .items,
    ).toEqual([]);
    const other = (
      await owner.agent
        .post('/api/conversations')
        .set('Origin', origin)
        .send({ recipientId: alice.id })
        .expect(200)
    ).body;
    await owner.agent
      .delete(`/api/conversations/${other.id}/messages`)
      .set('Origin', origin)
      .send({ throughMessageId: old.id })
      .expect(404);
    const events = await stream(owner);
    await owner.agent
      .delete(`/api/conversations/${room.id}/messages`)
      .set('Origin', origin)
      .send({ throughMessageId: newer.body.id })
      .expect(200);
    expect(await within(events.nextInvalidate(), 3000, 'history clear invalidation')).toEqual({
      conversationId: room.id,
    });
    events.close();
  });

  it('revokes cleared media for the viewer while preserving the peer download and new uploads', async () => {
    const owner = await login('미디어삭제요청자');
    const peer = await login('미디어삭제상대방');
    const room = (
      await owner.agent
        .post('/api/conversations')
        .set('Origin', origin)
        .send({ recipientId: peer.id })
        .expect(200)
    ).body;
    const png = Buffer.from(
      'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a53sAAAAASUVORK5CYII=',
      'base64',
    );
    const upload = () =>
      presignedUpload(
        owner.agent,
        `/api/conversations/${room.id}/attachments`,
        png,
        'image/png',
        'clear.png',
      );
    const file = (await upload()).body;
    const message = (
      await owner.agent
        .post(`/api/conversations/${room.id}/messages`)
        .set('Origin', origin)
        .send({ body: '', attachmentIds: [file.id], clientMessageId: randomUUID() })
        .expect(200)
    ).body;
    await owner.agent
      .delete(`/api/conversations/${room.id}/messages`)
      .set('Origin', origin)
      .send({ throughMessageId: message.id })
      .expect(200);
    await owner.agent.get(file.url).expect(404);
    await peer.agent.get(file.url).expect(307);
    const draft = (await upload()).body;
    await owner.agent.get(draft.url).expect(307);
    await peer.agent.get(draft.url).expect(404);
    await owner.agent.post('/api/blocks').set('Origin', origin).send({ blockedUserId: peer.id }).expect(200);
    await owner.agent
      .delete(`/api/conversations/${room.id}/messages`)
      .set('Origin', origin)
      .send({ throughMessageId: message.id })
      .expect(404);
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
    expect(await db.chatAttachment.count({ where: { conversationId } })).toBe(0);
  }, 12000);
});
