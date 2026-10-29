import { randomUUID } from 'node:crypto';

import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

import { ExpoPushTransport } from '@side/toolkit/push-notifications';

import { createTestApp, type ITestApi } from '../../test/support/app';
import { SessionService } from '../auth/session/session.service';
import { randomToken, sha256Hex } from '../common/crypto';
import { Database } from '../database/database.service';
import { NotificationService } from '../notification/notification.service';
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

const state: { api?: ITestApi } = {};

describe('푸시 작업의 오래된 due 조회 결과', () => {
  beforeAll(async () => {
    state.api = await createTestApp({ S3_BUCKET: 'push-claim-signing-only', S3_REGION: 'ap-northeast-2' });
  });
  afterAll(async () => {
    await state.api?.close();
  });

  it('다른 작업자가 재시도 시각을 미래로 옮겼다면 이전 조회로 즉시 다시 임대하지 않아야 한다', async () => {
    if (!state.api) throw new Error('Expected an isolated push-claim fixture.');
    const api = state.api;
    const user = await api.db.user.create({
      data: { nickname: '푸시임대회귀', provider: 'testing', providerId: randomUUID() },
    });
    const session = await api.db.session.create({
      data: {
        userId: user.id,
        tokenHash: sha256Hex(randomToken()),
        expiresAt: new Date(Date.now() + 60_000),
      },
    });
    const device = await api.db.pushDevice.create({
      data: {
        id: randomUUID(),
        token: `ExpoPushToken[${randomUUID().replaceAll('-', '')}]`,
        userId: user.id,
        sessionKey: session.tokenHash,
        platform: 'android',
      },
    });
    const now = new Date();
    const job = await api.db.pushDelivery.create({
      data: {
        deviceId: device.id,
        eventId: 'notification:claim-probe',
        status: 'TICKET',
        ticketId: 'old-ticket',
        nextAttemptAt: now,
        createdAt: now,
      },
    });
    const gate = new FirstReadGate();
    const observed = api.app.get(Database).$extends({
      query: {
        pushDelivery: {
          async findMany({ args, query }) {
            return gate.intercept(await query(args));
          },
        },
      },
    });
    const service = new PushService(
      observed as unknown as Database,
      api.app.get(NotificationService),
      api.app.get(SessionService),
    );
    const fetcher = vi.fn<typeof globalThis.fetch>().mockImplementation(async () =>
      Response.json({
        data: { 'old-ticket': { status: 'error', details: { error: 'MessageRateExceeded' } } },
      }),
    );
    const transport = new ExpoPushTransport({ fetch: fetcher });
    const staleWorker = service.runOnce(transport, now);
    await gate.paused;
    try {
      await service.runOnce(transport, now);
      expect(fetcher).toHaveBeenCalledTimes(1);
      gate.release();
      await staleWorker;
      expect(fetcher).toHaveBeenCalledTimes(1);
      expect(await api.db.pushDelivery.findUniqueOrThrow({ where: { id: job.id } })).toMatchObject({
        status: 'PENDING',
        attempts: 1,
        ticketId: null,
        leaseToken: null,
        nextAttemptAt: new Date(now.getTime() + 30_000),
      });
    } finally {
      gate.release();
      await staleWorker;
      await api.db.user.delete({ where: { id: user.id } });
    }
  });
});
