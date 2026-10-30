import { describe, expect, it, vi } from 'vitest';

import {
  ExpoPushTransport,
  PushDispatcher,
  type IPushJob,
  type IPushJobUpdate,
  type IPushMessage,
} from './index';

const now = new Date('2026-10-30T00:00:00Z');
const receiptDelay = 15 * 60_000;
const message: IPushMessage = {
  to: 'ExpoPushToken[aaaaaaaaaaaaaaaaaaaa]',
  title: '새 알림',
  body: '알림이 있어요.',
  data: { path: '/notifications', notificationId: 'notification:1' },
  badge: 1,
  sound: 'default',
  channelId: 'activity',
};

function setup(overrides: Partial<IPushJob> = {}) {
  const job = {
    id: 'job',
    deviceId: 'device',
    eventId: 'notification:1',
    status: 'TICKET',
    attempts: 0,
    ticketId: 'old-ticket',
    createdAt: now,
    ...overrides,
    nextAttemptAt: now,
    lease: null as string | null,
  };
  const fetcher = vi.fn<typeof globalThis.fetch>();
  const disable = vi.fn(async () => undefined);
  const prepare = vi.fn(async () => message);
  const dispatcher = new PushDispatcher(
    {
      due: async (date) =>
        ['PENDING', 'TICKET'].includes(job.status) && job.nextAttemptAt <= date ? [{ ...job }] : [],
      claim: async (_id, lease, date) => {
        if (job.lease || job.nextAttemptAt > date || !['PENDING', 'TICKET'].includes(job.status))
          return false;
        job.lease = lease;
        return true;
      },
      finish: async (_id, lease, update: IPushJobUpdate) => {
        if (job.lease === lease) Object.assign(job, update, { lease: null });
      },
      disable,
      prepare,
    },
    new ExpoPushTransport({ fetch: fetcher }),
  );
  return { job, fetcher, disable, prepare, dispatcher };
}

function rateLimitedReceipt(id = 'old-ticket') {
  return Response.json({ data: { [id]: { status: 'error', details: { error: 'MessageRateExceeded' } } } });
}

describe('전달 영수증의 일시적인 기기 전송 제한', () => {
  it('기존 티켓을 비우고 대기한 뒤 새 티켓과 성공 영수증으로 전달을 완료해야 한다', async () => {
    const state = setup();
    state.fetcher.mockResolvedValueOnce(rateLimitedReceipt());
    await state.dispatcher.run(now);
    expect(state.job).toMatchObject({ status: 'PENDING', attempts: 1, ticketId: null });
    expect(state.prepare).not.toHaveBeenCalled();
    await state.dispatcher.run(now);
    await state.dispatcher.run(new Date(now.getTime() + 29_999));
    expect(state.fetcher).toHaveBeenCalledTimes(1);

    const resendAt = new Date(now.getTime() + 30_000);
    state.fetcher.mockResolvedValueOnce(Response.json({ data: [{ status: 'ok', id: 'new-ticket' }] }));
    await Promise.all([state.dispatcher.run(resendAt), state.dispatcher.run(resendAt)]);
    expect(state.job).toMatchObject({ status: 'TICKET', attempts: 1, ticketId: 'new-ticket' });
    expect(state.prepare).toHaveBeenCalledTimes(1);
    expect(state.fetcher).toHaveBeenCalledTimes(2);

    state.fetcher.mockResolvedValueOnce(Response.json({ data: { 'new-ticket': { status: 'ok' } } }));
    await state.dispatcher.run(new Date(resendAt.getTime() + receiptDelay));
    expect(state.job.status).toBe('DELIVERED');
    expect(state.fetcher.mock.calls.map(([url]) => String(url).split('/').at(-1))).toEqual([
      'getReceipts',
      'send',
      'getReceipts',
    ]);
    expect(JSON.parse(String(state.fetcher.mock.calls[2]?.[1]?.body))).toEqual({ ids: ['new-ticket'] });
    expect(state.disable).not.toHaveBeenCalled();
  });

  it.each([
    { attempts: 0, delay: 30_000 },
    { attempts: 1, delay: 60_000 },
    { attempts: 4, delay: 480_000 },
  ])('재시도 $attempts회 뒤에는 $delay ms를 기다려야 한다', async ({ attempts, delay }) => {
    const state = setup({ attempts });
    state.fetcher.mockResolvedValueOnce(rateLimitedReceipt());
    await state.dispatcher.run(now);
    expect(state.job).toMatchObject({
      status: 'PENDING',
      attempts: attempts + 1,
      ticketId: null,
      nextAttemptAt: new Date(now.getTime() + delay),
    });
    await state.dispatcher.run(new Date(now.getTime() + delay - 1));
    expect(state.fetcher).toHaveBeenCalledTimes(1);
  });

  it('영수증의 전송 제한도 최대 6회에서 끝내고 영구 실패를 재전송하지 않아야 한다', async () => {
    const state = setup({ attempts: 5 });
    state.fetcher.mockResolvedValueOnce(rateLimitedReceipt());
    await state.dispatcher.run(now);
    expect(state.job).toMatchObject({ status: 'FAILED', attempts: 6, ticketId: null });
    await state.dispatcher.run(new Date(now.getTime() + 60 * 60_000));
    expect(state.fetcher).toHaveBeenCalledTimes(1);
  });

  it('24시간 지난 작업은 영수증을 다시 조회하거나 재전송하지 않아야 한다', async () => {
    const state = setup({ createdAt: new Date(now.getTime() - 24 * 60 * 60_000) });
    await state.dispatcher.run(now);
    expect(state.job.status).toBe('FAILED');
    expect(state.fetcher).not.toHaveBeenCalled();
  });

  it('DeviceNotRegistered 영수증은 기기를 비활성화하고 영구 실패로 유지해야 한다', async () => {
    const state = setup();
    state.fetcher.mockResolvedValueOnce(
      Response.json({
        data: { 'old-ticket': { status: 'error', details: { error: 'DeviceNotRegistered' } } },
      }),
    );
    await state.dispatcher.run(now);
    expect(state.job.status).toBe('FAILED');
    expect(state.disable).toHaveBeenCalledExactlyOnceWith('device');
    await state.dispatcher.run(new Date(now.getTime() + receiptDelay));
    expect(state.fetcher).toHaveBeenCalledTimes(1);
  });
});
