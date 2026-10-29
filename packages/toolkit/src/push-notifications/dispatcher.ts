import { randomUUID } from 'node:crypto';

import { match, P } from 'ts-pattern';

import { ExpoPushTransport, PushProviderError, type IPushMessage } from './index';

export interface IPushJob {
  id: string;
  deviceId: string;
  eventId: string;
  status: string;
  attempts: number;
  ticketId: string | null;
  createdAt: Date;
}
export interface IPushJobUpdate {
  status: 'PENDING' | 'TICKET' | 'DELIVERED' | 'FAILED' | 'CANCELLED';
  nextAttemptAt?: Date;
  ticketId?: string | null;
  attempts?: number;
}
export interface IPushStore {
  due(now: Date): Promise<IPushJob[]>;
  claim(id: string, lease: string, now: Date, until: Date): Promise<boolean>;
  finish(id: string, lease: string, update: IPushJobUpdate): Promise<void>;
  disable(deviceId: string): Promise<void>;
  prepare(job: IPushJob): Promise<IPushMessage | null>;
}

const MAX_ATTEMPTS = 6;
const RECEIPT_DELAY_MS = 15 * 60_000;
const MAX_AGE_MS = 24 * 60 * 60_000;

/** 티켓 수락과 실제 전달 영수증을 구분하고, DB 임대로 여러 API 인스턴스의 중복 전송을 줄인다. */
export class PushDispatcher {
  constructor(
    private readonly store: IPushStore,
    private readonly transport: ExpoPushTransport,
  ) {}

  async run(now = new Date()): Promise<void> {
    const jobs = await this.store.due(now);
    const claimed: { job: IPushJob; lease: string }[] = [];
    for (const job of jobs) {
      const lease = randomUUID();
      if (await this.store.claim(job.id, lease, now, new Date(now.getTime() + 120_000)))
        claimed.push({ job, lease });
    }
    const pending: { job: IPushJob; lease: string; message: IPushMessage }[] = [];
    const receipts: { job: IPushJob; lease: string; ticketId: string }[] = [];
    for (const item of claimed) {
      if (now.getTime() - item.job.createdAt.getTime() >= MAX_AGE_MS) {
        await this.store.finish(item.job.id, item.lease, { status: 'FAILED' });
        continue;
      }
      if (item.job.status === 'TICKET' && item.job.ticketId) {
        receipts.push({ ...item, ticketId: item.job.ticketId });
        continue;
      }
      const message = await this.store.prepare(item.job);
      if (!message) {
        await this.store.finish(item.job.id, item.lease, { status: 'CANCELLED' });
        continue;
      }
      pending.push({ ...item, message });
    }
    if (pending.length) {
      try {
        const tickets = await this.transport.send(pending.map((item) => item.message));
        for (const [index, item] of pending.entries()) {
          const ticket = tickets[index];
          if (ticket?.status === 'ok') {
            await this.store.finish(item.job.id, item.lease, {
              status: 'TICKET',
              ticketId: ticket.id,
              nextAttemptAt: new Date(now.getTime() + RECEIPT_DELAY_MS),
            });
            continue;
          }
          if (ticket?.status === 'error' && ticket.code === 'DeviceNotRegistered')
            await this.store.disable(item.job.deviceId);
          await this.retry(item, now, ticket?.status === 'error' && ticket.code === 'MessageRateExceeded');
        }
      } catch (error) {
        const failure = match(error)
          .with(P.instanceOf(PushProviderError), ({ retryable, retryAfterMs }) => ({
            retryable,
            delay: retryAfterMs,
          }))
          .otherwise(() => ({ retryable: false, delay: undefined }));
        for (const item of pending) await this.retry(item, now, failure.retryable, failure.delay);
      }
    }
    if (receipts.length) {
      try {
        const results = await this.transport.receipts(receipts.map((item) => item.ticketId));
        for (const item of receipts) {
          const result = results[item.ticketId];
          if (!result) {
            await this.store.finish(item.job.id, item.lease, {
              status: 'TICKET',
              nextAttemptAt: new Date(now.getTime() + RECEIPT_DELAY_MS),
            });
            continue;
          }
          if (result.status === 'error' && result.code === 'MessageRateExceeded') {
            await this.retry(item, now, true);
            continue;
          }
          if (result.status === 'error' && result.code === 'DeviceNotRegistered')
            await this.store.disable(item.job.deviceId);
          await this.store.finish(item.job.id, item.lease, {
            status: result.status === 'ok' ? 'DELIVERED' : 'FAILED',
          });
        }
      } catch {
        for (const item of receipts)
          await this.store.finish(item.job.id, item.lease, {
            status: 'TICKET',
            nextAttemptAt: new Date(now.getTime() + RECEIPT_DELAY_MS),
          });
      }
    }
  }

  private async retry(item: { job: IPushJob; lease: string }, now: Date, retryable: boolean, delay?: number) {
    const attempts = item.job.attempts + 1;
    await this.store.finish(item.job.id, item.lease, {
      status: retryable && attempts < MAX_ATTEMPTS ? 'PENDING' : 'FAILED',
      attempts,
      ticketId: null,
      nextAttemptAt: new Date(
        now.getTime() + Math.max(delay ?? 0, 30_000 * 2 ** Math.min(attempts - 1, MAX_ATTEMPTS - 1)),
      ),
    });
  }
}
