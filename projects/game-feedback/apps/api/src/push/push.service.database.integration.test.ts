import { spawnSync } from 'node:child_process';
import { randomBytes, randomUUID } from 'node:crypto';
import { createRequire } from 'node:module';

import type { INestApplication } from '@nestjs/common';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

import { ExpoPushTransport } from '@side/toolkit/push-notifications';

import { createApp } from '../app';
import { assertDatabaseUrl } from '../database/database-url';
import { createPrismaAdapter } from '../database/prisma-adapter';
import { PrismaClient } from '../generated/prisma';
import { hash, token } from '../security';
import { PushService } from './push.service';

class FirstReadGate {
  private captured = false;
  private markPaused: () => void = () => undefined;
  release: () => void = () => undefined;
  readonly paused = new Promise<void>((resolve) => {
    this.markPaused = resolve;
  });
  private readonly released = new Promise<void>((resolve) => {
    this.release = resolve;
  });

  async intercept<T>(rows: T) {
    if (this.captured) return rows;
    this.captured = true;
    this.markPaused();
    await this.released;
    return rows;
  }
}

const require = createRequire(import.meta.url);
const schema = `gf_test_push_claim_${randomBytes(8).toString('hex')}`;
const state: { db?: PrismaClient; app?: INestApplication } = {};
const gate = new FirstReadGate();

describe('푸시 작업의 오래된 due 조회 결과', () => {
  beforeAll(async () => {
    const target = new URL(process.env.DATABASE_URL ?? '');
    target.searchParams.set('schema', schema);
    const databaseUrl = assertDatabaseUrl(target.toString(), 'test');
    const migration = spawnSync(
      process.execPath,
      [require.resolve('prisma/build/index.js'), 'migrate', 'deploy'],
      {
        env: { ...process.env, DATABASE_URL: databaseUrl },
        encoding: 'utf8',
      },
    );
    if (migration.status !== 0) throw new Error(`Push-claim migration failed: ${migration.stderr}`);
    const db = new PrismaClient({ adapter: createPrismaAdapter(databaseUrl) });
    state.db = db;
    const observed = db.$extends({
      query: {
        pushDelivery: {
          async findMany({ args, query }) {
            return gate.intercept(await query(args));
          },
        },
      },
    });
    state.app = await createApp({
      databaseUrl,
      prisma: observed as unknown as PrismaClient,
      rateLimit: false,
    });
  }, 30_000);

  afterAll(async () => {
    gate.release();
    await state.app?.close();
    if (!state.db) return;
    if (!/^gf_test_push_claim_[a-f0-9]{16}$/.test(schema)) throw new Error('Unowned push-claim schema.');
    await state.db.$executeRawUnsafe(`DROP SCHEMA "${schema}" CASCADE`);
    await state.db.$disconnect();
  });

  it('다른 작업자가 재시도 시각을 미래로 옮겼다면 이전 조회로 즉시 다시 임대하지 않아야 한다', async () => {
    if (!state.db || !state.app) throw new Error('Expected an isolated push-claim fixture.');
    const db = state.db;
    const user = await db.user.create({
      data: { nickname: '푸시 임대 사용자', termsVersion: 'test', ageConfirmed: true },
    });
    const session = await db.session.create({
      data: { userId: user.id, tokenHash: hash(token()), expiresAt: new Date(Date.now() + 60_000) },
    });
    const device = await db.pushDevice.create({
      data: {
        id: randomUUID(),
        token: `ExpoPushToken[${randomUUID().replaceAll('-', '')}]`,
        userId: user.id,
        sessionKey: session.id,
        platform: 'ios',
      },
    });
    const now = new Date();
    const job = await db.pushDelivery.create({
      data: {
        deviceId: device.id,
        eventId: 'chat:claim-probe',
        status: 'TICKET',
        ticketId: 'old-ticket',
        nextAttemptAt: now,
        createdAt: now,
      },
    });
    const fetcher = vi.fn<typeof globalThis.fetch>().mockImplementation(async () =>
      Response.json({
        data: { 'old-ticket': { status: 'error', details: { error: 'MessageRateExceeded' } } },
      }),
    );
    const service = state.app.get(PushService);
    const transport = new ExpoPushTransport({ fetch: fetcher });
    const staleWorker = service.runOnce(transport, now);
    await gate.paused;
    try {
      await service.runOnce(transport, now);
      expect(fetcher).toHaveBeenCalledTimes(1);
      gate.release();
      await staleWorker;
      expect(fetcher).toHaveBeenCalledTimes(1);
      expect(await db.pushDelivery.findUniqueOrThrow({ where: { id: job.id } })).toMatchObject({
        status: 'PENDING',
        attempts: 1,
        ticketId: null,
        leaseToken: null,
        nextAttemptAt: new Date(now.getTime() + 30_000),
      });
    } finally {
      gate.release();
      await staleWorker;
    }
  });
});
