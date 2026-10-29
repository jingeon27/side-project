import { spawnSync } from 'node:child_process';
import { randomBytes, randomUUID } from 'node:crypto';
import { request as httpRequest } from 'node:http';
import { createRequire } from 'node:module';
import type { AddressInfo } from 'node:net';
import type { ReadableStreamDefaultReader } from 'node:stream/web';

import type { INestApplication } from '@nestjs/common';
import * as Sentry from '@sentry/node';
import supertest from 'supertest';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { z } from 'zod';

import { ChatMessageSchema, ConversationSchema, SessionSchema } from '@game-feedback/contracts';

import { createApp } from '../app';
import { ChatEvents } from '../chat/events/chat.events';
import { COOKIE } from '../common/http/cookies';
import { assertDatabaseUrl } from '../database/database-url';
import { createPrismaAdapter } from '../database/prisma-adapter';
import { DemoProfileProvider } from '../game-profiles/providers/demo-profile.provider';
import { PrismaClient } from '../generated/prisma';
import { seed } from '../seed';
import { responseCookies } from '../testing/http-response';
import { sentryOptions } from './sentry';

const origin = 'http://localhost:3300';
const schema = `gf_test_monitoring_${randomBytes(8).toString('hex')}`;
const target = new URL(process.env.TEST_DATABASE_URL ?? process.env.DATABASE_URL ?? '');
target.searchParams.set('schema', schema);
const databaseUrl = assertDatabaseUrl(target.toString(), 'test');
const db = new PrismaClient({ adapter: createPrismaAdapter(databaseUrl) });
const require = createRequire(import.meta.url);
// The transport only retains envelopes in this process; it never calls a collector.
const envelopes: string[] = [];
const privateBody = 'monitoring-private-body SELECT private_sql_parameter FROM private_messages';
const privateQuery = 'monitoring-private-query-value';
const privateHeader = 'monitoring-private-header-value';
const privateCookie = 'monitoring-private-cookie-value';
const privatePath = 'monitoring-private-location';
const messageRoute = '/api/conversations/:id/messages';

const envelopeSchema = z.tuple([
  z.unknown(),
  z.array(z.tuple([z.object({ type: z.string() }), z.unknown()])),
]);
// SDK 11 streams ended v2 spans independently, including publish after the HTTP response.
const spanSchema = z.object({
  name: z.string(),
  trace_id: z.string().regex(/^[a-f0-9]{32}$/),
  span_id: z.string().regex(/^[a-f0-9]{16}$/),
  parent_span_id: z.string().optional(),
  start_timestamp: z.number().finite(),
  end_timestamp: z.number().finite(),
  status: z.enum(['ok', 'error']),
  attributes: z.record(z.string(), z.object({ type: z.string(), value: z.unknown() })),
});
const invalidationSchema = z.object({ conversationId: z.string().nullable() }).strict();
type TSpan = z.infer<typeof spanSchema>;
type TActor = { id: string; cookie: string; token: string };

function capturedSpans(): TSpan[] {
  return envelopes.flatMap((envelope) => {
    const [, items] = envelopeSchema.parse(JSON.parse(envelope));
    return items.flatMap(([header, payload]) => {
      if (header.type !== 'span') return [];
      return z.object({ items: z.array(spanSchema) }).parse(payload).items;
    });
  });
}

async function collectSpans(count: number) {
  await expect
    .poll(
      async () => {
        expect(await Sentry.flush(1000)).toBe(true);
        return capturedSpans().length;
      },
      { timeout: 5000 },
    )
    .toBe(count);
  return capturedSpans();
}

function spanNamed(spans: readonly TSpan[], name: string) {
  const matches = spans.filter((span) => span.name === name);
  expect(matches).toHaveLength(1);
  const span = matches[0];
  if (!span) throw new Error('Expected the named performance span.');
  return span;
}

function expectPrivateTelemetryAbsent(values: readonly string[] = []) {
  const raw = envelopes.join('\n');
  for (const value of [privateBody, privateQuery, privateHeader, privateCookie, privatePath, ...values]) {
    expect(raw).not.toContain(value);
  }
  // Inspect raw envelopes too: span scrubbing must also cover the dynamic sampling context.
  expect(raw).not.toMatch(/"transaction"\s*:/);
  expect(raw).not.toMatch(/"(?:request|user|breadcrumbs|headers|cookies|body|query_string|sql)"\s*:/);
  expect(raw).not.toMatch(/\b(?:SELECT|INSERT INTO|FOR UPDATE)\b/);
  for (const span of capturedSpans()) {
    expect(span.end_timestamp).toBeGreaterThanOrEqual(span.start_timestamp);
    expect(span.attributes['service']?.value).toBe('game-feedback');
    expect(span.attributes['layer']?.value).toBe('api');
    for (const key of Object.keys(span.attributes)) {
      expect(key).not.toMatch(
        /^(?:user\.|url\.|db\.|http\.(?:request|response)\.(?:headers?|body)|http\.url)/,
      );
    }
  }
}

function createMonitoringApp() {
  return createApp({
    databaseUrl,
    prisma: db,
    webOrigin: origin,
    demoMode: true,
    rateLimit: false,
    profileProvider: new DemoProfileProvider(),
    // No media operation is used. Explicit inert credentials avoid ambient AWS credentials/metadata.
    mediaStorage: {
      bucket: 'monitoring-signing-only',
      region: 'ap-northeast-2',
      endpoint: 'https://storage.invalid',
      forcePathStyle: false,
      accessKeyId: 'monitoring-fixture-access-key',
      secretAccessKey: 'monitoring-fixture-secret-key',
    },
  });
}

async function login(app: INestApplication, nickname: string): Promise<TActor> {
  const response = await supertest(app.getHttpServer())
    .post('/api/auth/demo')
    .set('Origin', origin)
    .send({ nickname })
    .expect(200);
  const { user } = SessionSchema.parse(response.body);
  const cookie = responseCookies(response)
    .find((value) => value.startsWith(`${COOKIE}=`))
    ?.split(';')[0];
  if (!user || !cookie) throw new Error('Expected an authenticated monitoring fixture.');
  return { id: user.id, cookie, token: cookie.slice(COOKIE.length + 1) };
}

async function conversation(app: INestApplication, sender: TActor, recipient: TActor) {
  const response = await supertest(app.getHttpServer())
    .post('/api/conversations')
    .set('Origin', origin)
    .set('Cookie', sender.cookie)
    .send({ recipientId: recipient.id })
    .expect(200);
  return ConversationSchema.parse(response.body);
}

async function listen(app: INestApplication) {
  await app.listen(0, '127.0.0.1');
  const address = app.getHttpServer().address() as AddressInfo;
  return `http://127.0.0.1:${address.port}`;
}

class MonitoringStream {
  private readonly decoder = new TextDecoder();
  private pending = '';

  constructor(
    private readonly controller: AbortController,
    private readonly reader: ReadableStreamDefaultReader<Uint8Array>,
  ) {}

  static async open(baseUrl: string, actor: TActor) {
    const controller = new AbortController();
    try {
      const response = await fetch(`${baseUrl}/api/chat/events?token=${privateQuery}`, {
        headers: { Cookie: `${actor.cookie}; monitoring_private=${privateCookie}` },
        signal: AbortSignal.any([controller.signal, AbortSignal.timeout(15_000)]),
      });
      expect(response.status).toBe(200);
      expect(response.headers.get('content-type')).toContain('text/event-stream');
      if (!response.body) throw new Error('Expected an SSE response body.');
      const stream = new MonitoringStream(controller, response.body.getReader());
      expect(await stream.nextInvalidation()).toEqual({ conversationId: null });
      return stream;
    } catch (error) {
      controller.abort();
      throw error;
    }
  }

  async nextInvalidation(): Promise<z.infer<typeof invalidationSchema>> {
    const boundary = this.pending.indexOf('\n\n');
    if (boundary >= 0) {
      const frame = this.pending.slice(0, boundary);
      this.pending = this.pending.slice(boundary + 2);
      const lines = frame.split('\n');
      const event = lines
        .find((line) => line.startsWith('event:'))
        ?.slice(6)
        .trim();
      if (event !== 'invalidate') return this.nextInvalidation();
      const data = lines.filter((line) => line.startsWith('data:')).map((line) => line.slice(5).trim());
      return invalidationSchema.parse(JSON.parse(data.join('\n')));
    }
    const chunk = await this.reader.read();
    if (chunk.done) throw new Error('SSE ended before the expected invalidation.');
    this.pending += this.decoder.decode(chunk.value, { stream: true }).replaceAll('\r\n', '\n');
    return this.nextInvalidation();
  }

  async close() {
    this.controller.abort();
    // Aborting fetch can reject cancel with AbortError; still release the owned reader.
    await Promise.allSettled([this.reader.cancel()]);
    this.reader.releaseLock();
  }
}

beforeAll(async () => {
  const migration = spawnSync(
    process.execPath,
    [require.resolve('prisma/build/index.js'), 'migrate', 'deploy'],
    { env: { ...process.env, DATABASE_URL: databaseUrl }, encoding: 'utf8', timeout: 30_000 },
  );
  if (migration.status !== 0) throw new Error('Isolated monitoring schema migration failed.');
  await seed(db, false);
}, 30_000);

beforeEach(() => {
  vi.stubEnv('ENVIRONMENT', 'test');
  vi.stubEnv('SENTRY_DSN', 'https://monitoring@sentry.invalid/1');
  vi.stubEnv('SENTRY_RELEASE', 'monitoring-integration');
  envelopes.length = 0;
  const options = sentryOptions();
  if (!options) throw new Error('Expected isolated Sentry options.');
  expect(options.defaultIntegrations).toBe(false);
  Sentry.init({
    ...options,
    tracesSampleRate: 1,
    spotlight: false,
    transport: () => ({
      send: async (envelope) => {
        envelopes.push(JSON.stringify(envelope));
        return { statusCode: 200 };
      },
      flush: async () => true,
    }),
  });
});

afterEach(async () => {
  try {
    await Sentry.close(2000);
  } finally {
    vi.unstubAllEnvs();
  }
});

afterAll(async () => {
  try {
    if (!/^gf_test_monitoring_[a-f0-9]{16}$/.test(schema)) throw new Error('Unowned monitoring schema.');
    await db.$executeRawUnsafe(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);
  } finally {
    await db.$disconnect();
  }
});

describe('실제 PostgreSQL·HTTP·SSE의 채팅 성능 계측', () => {
  it('HTTP 아래 persist/insert와 커밋 후 publish를 같은 trace로 보내고 비공개 입력은 제거한다', async () => {
    const app = await createMonitoringApp();
    try {
      const sender = await login(app, '계측전송자');
      const recipient = await login(app, '계측수신자');
      const room = await conversation(app, sender, recipient);
      const stream = await MonitoringStream.open(await listen(app), recipient);
      try {
        await Sentry.flush(1000);
        envelopes.length = 0;
        const clientMessageId = randomUUID();
        const response = await supertest(app.getHttpServer())
          .post(`/api/conversations/${room.id}/messages`)
          .query({ token: privateQuery })
          .set('Origin', origin)
          .set('Authorization', `Bearer ${sender.token}`)
          .set('Cookie', `${sender.cookie}; monitoring_private=${privateCookie}`)
          .set('X-Monitoring-Private', privateHeader)
          .send({ body: privateBody, clientMessageId })
          .expect(200);
        const message = ChatMessageSchema.parse(response.body);
        expect(await db.chatMessage.findUniqueOrThrow({ where: { id: message.id } })).toMatchObject({
          body: privateBody,
          clientMessageId,
          conversationId: room.id,
          senderId: sender.id,
        });
        expect(await stream.nextInvalidation()).toEqual({ conversationId: room.id });
        const spans = await collectSpans(4);
        const http = spanNamed(spans, `POST ${messageRoute}`);
        const persist = spanNamed(spans, 'chat.persist');
        const insert = spanNamed(spans, 'chat.insert');
        const publish = spanNamed(spans, 'chat.publish');
        expect(http.attributes['sentry.op']?.value).toBe('http.server');
        expect(http.attributes['http.route']?.value).toBe(messageRoute);
        expect(http.attributes['http.request.method']?.value).toBe('POST');
        expect(http.attributes['http.response.status_code']?.value).toBe(200);
        expect(http.parent_span_id).toBeUndefined();
        expect(persist.attributes['sentry.op']?.value).toBe('db.transaction');
        expect(insert.attributes['sentry.op']?.value).toBe('db.query');
        expect(publish.attributes['sentry.op']?.value).toBe('messaging.publish');
        expect(new Set(spans.map((span) => span.trace_id))).toEqual(new Set([http.trace_id]));
        expect(persist.parent_span_id).toBe(http.span_id);
        expect(insert.parent_span_id).toBe(persist.span_id);
        expect(publish.parent_span_id).toBe(http.span_id);
        expect(persist.start_timestamp).toBeGreaterThanOrEqual(http.start_timestamp);
        expect(insert.start_timestamp).toBeGreaterThanOrEqual(persist.start_timestamp);
        expect(insert.end_timestamp).toBeLessThanOrEqual(persist.end_timestamp);
        expect(publish.start_timestamp).toBeGreaterThanOrEqual(persist.end_timestamp);
        // sent counts server subscriber.next calls, not browser receipt acknowledgements.
        expect(publish.attributes).toMatchObject({
          'chat.publish.recipients': { value: 1 },
          'chat.publish.sent': { value: 1 },
          'chat.publish.unavailable': { value: 0 },
          'chat.publish.denied': { value: 0 },
          'chat.publish.failed': { value: 0 },
        });
        // HTTP/publish may overlap; deliberately do not order their end timestamps or add durations.
        expectPrivateTelemetryAbsent([
          sender.id,
          recipient.id,
          room.id,
          message.id,
          clientMessageId,
          sender.cookie,
          sender.token,
          recipient.cookie,
          recipient.token,
        ]);
      } finally {
        await stream.close();
      }
    } finally {
      app.get(ChatEvents).closeAll();
      await app.close();
    }
  });

  it('멱등 재시도는 INSERT span을 만들지 않고 충돌은 persist 오류와 HTTP 409만 남긴다', async () => {
    const app = await createMonitoringApp();
    try {
      const sender = await login(app, '재시도전송자');
      const recipient = await login(app, '재시도수신자');
      const room = await conversation(app, sender, recipient);
      const clientMessageId = randomUUID();
      const send = (body: string) =>
        supertest(app.getHttpServer())
          .post(`/api/conversations/${room.id}/messages`)
          .set('Origin', origin)
          .set('Cookie', sender.cookie)
          .send({ body, clientMessageId });
      await Sentry.flush(1000);
      envelopes.length = 0;
      const original = ChatMessageSchema.parse((await send(privateBody).expect(200)).body);
      await expect
        .poll(async () => {
          await Sentry.flush(1000);
          return capturedSpans().filter((span) => span.name === 'chat.publish').length;
        })
        .toBe(1);
      envelopes.length = 0;
      const retry = ChatMessageSchema.parse((await send(privateBody).expect(200)).body);
      expect(retry.id).toBe(original.id);
      const retrySpans = await collectSpans(3);
      const retryHttp = spanNamed(retrySpans, `POST ${messageRoute}`);
      expect(retrySpans.some((span) => span.name === 'chat.insert')).toBe(false);
      expect(spanNamed(retrySpans, 'chat.persist').parent_span_id).toBe(retryHttp.span_id);
      expect(spanNamed(retrySpans, 'chat.publish').attributes).toMatchObject({
        'chat.publish.recipients': { value: 0 },
        'chat.publish.sent': { value: 0 },
        'chat.publish.failed': { value: 0 },
      });
      expect(await db.chatMessage.count({ where: { conversationId: room.id } })).toBe(1);
      expectPrivateTelemetryAbsent([clientMessageId, original.id, room.id, sender.token]);
      envelopes.length = 0;
      await send(`${privateBody} changed`).expect(409);
      const conflictSpans = await collectSpans(2);
      const conflictHttp = spanNamed(conflictSpans, `POST ${messageRoute}`);
      expect(conflictHttp.attributes['http.response.status_code']?.value).toBe(409);
      const persist = spanNamed(conflictSpans, 'chat.persist');
      expect(persist.status).toBe('error');
      expect(persist.parent_span_id).toBe(conflictHttp.span_id);
      expect(persist.trace_id).toBe(conflictHttp.trace_id);
      expect(conflictHttp.trace_id).not.toBe(retryHttp.trace_id);
      expectPrivateTelemetryAbsent([clientMessageId, original.id, room.id, sender.token]);
    } finally {
      await app.close();
    }
  });

  it('인증·Origin·JSON 파싱 오류와 알 수 없는 경로에도 원본 URL 대신 패턴과 상태만 보낸다', async () => {
    const app = await createMonitoringApp();
    try {
      const conversationId = randomUUID();
      const clientMessageId = randomUUID();
      const path = `/api/conversations/${conversationId}/messages?token=${privateQuery}`;
      await supertest(app.getHttpServer())
        .post(path)
        .set('Origin', origin)
        .set('X-Monitoring-Private', privateHeader)
        .send({ body: privateBody, clientMessageId })
        .expect(401);
      await supertest(app.getHttpServer())
        .post(path)
        .set('Origin', 'https://monitoring-private-origin.invalid')
        .set('Cookie', `monitoring_private=${privateCookie}`)
        .send({ body: privateBody, clientMessageId })
        .expect(403);
      await supertest(app.getHttpServer())
        .post(path)
        .set('Origin', origin)
        .set('Content-Type', 'application/json')
        .send(`{"body":"${privateBody}"`)
        .expect(400);
      await supertest(app.getHttpServer()).get(`/api/${privatePath}?token=${privateQuery}`).expect(404);
      await supertest(app.getHttpServer()).get(`/${privatePath}?token=${privateQuery}`).expect(404);
      const spans = await collectSpans(5);
      expect(new Set(spans.map((span) => span.trace_id)).size).toBe(5);
      expect(
        spans.map((span) => ({
          name: span.name,
          route: span.attributes['http.route']?.value,
          status: span.attributes['http.response.status_code']?.value,
        })),
      ).toEqual(
        expect.arrayContaining([
          { name: `POST ${messageRoute}`, route: messageRoute, status: 401 },
          { name: 'POST unmatched', route: 'unmatched', status: 403 },
          { name: 'POST unmatched', route: 'unmatched', status: 400 },
          { name: 'GET unmatched', route: 'unmatched', status: 404 },
          { name: 'GET unmatched', route: 'unmatched', status: 404 },
        ]),
      );
      expect(spans.every((span) => span.attributes['sentry.op']?.value === 'http.server')).toBe(true);
      expectPrivateTelemetryAbsent([conversationId, clientMessageId, 'monitoring-private-origin.invalid']);
    } finally {
      await app.close();
    }
  });

  it('health와 SSE는 연결을 닫은 뒤에도 HTTP 성능 span을 만들지 않는다', async () => {
    const app = await createMonitoringApp();
    try {
      const actor = await login(app, '연결제외사용자');
      await Sentry.flush(1000);
      envelopes.length = 0;
      const stream = await MonitoringStream.open(await listen(app), actor);
      try {
        await supertest(app.getHttpServer()).get('/api/health').expect(200);
        await supertest(app.getHttpServer()).get('/api/health/live').expect(200);
        await supertest(app.getHttpServer()).get('/api/health/ready').expect(200);
        await supertest(app.getHttpServer()).head('/api/health/ready').expect(200);
        await supertest(app.getHttpServer()).get('/api/chat/events').expect(401);
      } finally {
        await stream.close();
      }
      app.get(ChatEvents).closeAll();
      expect(await Sentry.flush(1000)).toBe(true);
      expect(capturedSpans()).toEqual([]);
      expectPrivateTelemetryAbsent([actor.id, actor.token]);
    } finally {
      app.get(ChatEvents).closeAll();
      await app.close();
    }
  });

  it('본문 수신 중 끊긴 요청은 close에서 한 번 종료하고 경로와 부분 JSON을 남기지 않는다', async () => {
    const app = await createMonitoringApp();
    try {
      const baseUrl = await listen(app);
      const received = new Promise<void>((resolve) => {
        app.getHttpServer().once('request', () => setImmediate(resolve));
      });
      const client = httpRequest(
        `${baseUrl}/api/conversations/${privatePath}/messages?token=${privateQuery}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Content-Length': '4096', Origin: origin },
          signal: AbortSignal.timeout(5000),
        },
      );
      const disconnected = new Promise<Error>((resolve) => client.once('error', resolve));
      try {
        client.write(`{"body":"${privateBody}`);
        await received;
        client.destroy();
        await disconnected;
        const spans = await collectSpans(1);
        const span = spanNamed(spans, 'POST unmatched');
        expect(span.attributes['http.response.aborted']?.value).toBe(true);
        expect([undefined, 400]).toContain(span.attributes['http.response.status_code']?.value);
        expect(span.status).toBe('error');
        expectPrivateTelemetryAbsent();
      } finally {
        client.destroy();
      }
    } finally {
      await app.close();
    }
  });

  it('실제 세션 조회 실패를 성공 전달로 세지 않고 failed 계수로 구분한다', async () => {
    const app = await createMonitoringApp();
    try {
      const actor = await login(app, '조회실패수신자');
      const stream = await MonitoringStream.open(await listen(app), actor);
      try {
        await Sentry.flush(1000);
        envelopes.length = 0;
        // Only this test's guarded schema is changed, and its table is restored even on failure.
        await db.$executeRawUnsafe('ALTER TABLE "Session" RENAME TO "MonitoringUnavailableSession"');
        try {
          await app.get(ChatEvents).publish([actor.id], randomUUID());
          const spans = await collectSpans(1);
          const publish = spanNamed(spans, 'chat.publish');
          expect(publish.attributes['sentry.op']?.value).toBe('messaging.publish');
          expect(publish.status).toBe('error');
          expect(publish.attributes).toMatchObject({
            'chat.publish.recipients': { value: 1 },
            'chat.publish.sent': { value: 0 },
            'chat.publish.unavailable': { value: 0 },
            'chat.publish.denied': { value: 0 },
            'chat.publish.failed': { value: 1 },
          });
          expectPrivateTelemetryAbsent([actor.id, actor.token, 'MonitoringUnavailableSession']);
        } finally {
          await db.$executeRawUnsafe('ALTER TABLE "MonitoringUnavailableSession" RENAME TO "Session"');
        }
      } finally {
        await stream.close();
      }
    } finally {
      app.get(ChatEvents).closeAll();
      await app.close();
    }
  });

  it('같은 대화의 동시 전송 두 건은 각각 독립된 HTTP trace와 자식 span을 유지한다', async () => {
    const app = await createMonitoringApp();
    try {
      const sender = await login(app, '동시전송사용자');
      const recipient = await login(app, '동시응답사용자');
      const room = await conversation(app, sender, recipient);
      const firstClientMessageId = randomUUID();
      const secondClientMessageId = randomUUID();
      const send = (actor: TActor, clientMessageId: string) =>
        supertest(app.getHttpServer())
          .post(`/api/conversations/${room.id}/messages`)
          .query({ token: privateQuery })
          .set('Origin', origin)
          .set('Authorization', `Bearer ${actor.token}`)
          .set('Cookie', `${actor.cookie}; monitoring_private=${privateCookie}`)
          .set('X-Monitoring-Private', privateHeader)
          .send({ body: privateBody, clientMessageId })
          .expect(200);
      await Sentry.flush(1000);
      envelopes.length = 0;
      const responses = await Promise.all([
        send(sender, firstClientMessageId),
        send(recipient, secondClientMessageId),
      ]);
      const messages = responses.map((response) => ChatMessageSchema.parse(response.body));
      const stored = await db.chatMessage.findMany({
        where: { conversationId: room.id },
        select: { id: true, clientMessageId: true, senderId: true, body: true },
      });
      expect(stored).toHaveLength(2);
      expect(stored).toEqual(
        expect.arrayContaining(
          messages.map((message) => ({
            id: message.id,
            clientMessageId: message.clientMessageId,
            senderId: message.sender.id,
            body: privateBody,
          })),
        ),
      );
      const spans = await collectSpans(8);
      const httpSpans = spans.filter((span) => span.name === `POST ${messageRoute}`);
      expect(httpSpans).toHaveLength(2);
      expect(new Set(spans.map((span) => span.trace_id)).size).toBe(2);
      expect(new Set(httpSpans.map((span) => span.trace_id)).size).toBe(2);
      for (const http of httpSpans) {
        const trace = spans.filter((span) => span.trace_id === http.trace_id);
        expect(trace).toHaveLength(4);
        expect(http.parent_span_id).toBeUndefined();
        expect(http.attributes['http.route']?.value).toBe(messageRoute);
        expect(http.attributes['http.response.status_code']?.value).toBe(200);
        const persist = spanNamed(trace, 'chat.persist');
        expect(persist.parent_span_id).toBe(http.span_id);
        expect(spanNamed(trace, 'chat.insert').parent_span_id).toBe(persist.span_id);
        expect(spanNamed(trace, 'chat.publish').parent_span_id).toBe(http.span_id);
      }
      expectPrivateTelemetryAbsent([
        sender.id,
        recipient.id,
        sender.token,
        recipient.token,
        sender.cookie,
        recipient.cookie,
        room.id,
        firstClientMessageId,
        secondClientMessageId,
        ...messages.map((message) => message.id),
      ]);
    } finally {
      await app.close();
    }
  });
});
