import { describe, expect, it, vi } from 'vitest';

import {
  ExpoPushTransport,
  PushDispatcher,
  type IPushJob,
  type IPushJobUpdate,
  type IPushMessage,
} from './index';

const now = new Date('2026-10-25T00:00:00Z');
const message: IPushMessage = {
  to: 'ExpoPushToken[aaaaaaaaaaaaaaaaaaaa]',
  title: '새 알림',
  body: '알림이 있어요.',
  data: { path: '/notifications', notificationId: 'notification:1' },
  badge: 1,
  sound: 'default',
  channelId: 'activity',
};
function setup() {
  const jobs = new Map<string, IPushJob & { lease: string | null; nextAttemptAt: Date }>();
  const add = (id: string, status = 'PENDING') =>
    jobs.set(id, {
      id,
      deviceId: `device-${id}`,
      eventId: `notification:${id}`,
      status,
      attempts: 0,
      ticketId: status === 'TICKET' ? `ticket-${id}` : null,
      createdAt: now,
      lease: null,
      nextAttemptAt: now,
    });
  const disable = vi.fn(async () => undefined);
  const prepare = vi.fn(async (): Promise<IPushMessage | null> => message);
  const fetch = vi.fn<typeof globalThis.fetch>();
  const dispatcher = new PushDispatcher(
    {
      due: async (date) =>
        [...jobs.values()].filter(
          (job) => ['PENDING', 'TICKET'].includes(job.status) && job.nextAttemptAt <= date,
        ),
      claim: async (id, lease) => {
        const job = jobs.get(id);
        if (!job || job.lease) return false;
        job.lease = lease;
        return true;
      },
      finish: async (id, lease, update: IPushJobUpdate) => {
        const job = jobs.get(id);
        if (job?.lease === lease) Object.assign(job, update, { lease: null });
      },
      prepare,
      disable,
    },
    new ExpoPushTransport({ fetch }),
  );
  return { jobs, add, disable, prepare, fetch, dispatcher };
}
describe('durable Expo dispatch', () => {
  it('keeps mixed tickets separate, disables invalid devices and retries only rate limits', async () => {
    const state = setup();
    for (const id of ['1', '2', '3']) state.add(id);
    state.fetch.mockResolvedValue(
      Response.json({
        data: [
          { status: 'ok', id: 'accepted' },
          { status: 'error', details: { error: 'DeviceNotRegistered' } },
          { status: 'error', details: { error: 'MessageRateExceeded' } },
        ],
      }),
    );
    await state.dispatcher.run(now);
    expect(state.jobs.get('1')).toMatchObject({ status: 'TICKET', ticketId: 'accepted', attempts: 0 });
    expect(state.jobs.get('2')).toMatchObject({ status: 'FAILED', attempts: 1 });
    expect(state.jobs.get('3')).toMatchObject({ status: 'PENDING', attempts: 1 });
    expect(state.disable).toHaveBeenCalledExactlyOnceWith('device-2');
    await state.dispatcher.run(now);
    expect(state.fetch).toHaveBeenCalledTimes(1);
  });
  it('cancels inaccessible or read events and prevents a concurrent worker from sending the same lease', async () => {
    const state = setup();
    state.add('1');
    state.prepare.mockResolvedValue(null);
    await Promise.all([state.dispatcher.run(now), state.dispatcher.run(now)]);
    expect(state.jobs.get('1')?.status).toBe('CANCELLED');
    expect(state.prepare).toHaveBeenCalledTimes(1);
    expect(state.fetch).not.toHaveBeenCalled();
  });
  it('waits for receipts and never resends an accepted ticket after receipt lookup fails', async () => {
    const state = setup();
    state.add('1', 'TICKET');
    state.add('2', 'TICKET');
    state.fetch.mockRejectedValueOnce(new Error('offline'));
    await state.dispatcher.run(now);
    expect(state.jobs.get('1')?.status).toBe('TICKET');
    state.fetch.mockResolvedValueOnce(Response.json({ data: { 'ticket-1': { status: 'ok' } } }));
    await state.dispatcher.run(new Date(now.getTime() + 15 * 60_000));
    expect(state.jobs.get('1')?.status).toBe('DELIVERED');
    expect(state.jobs.get('2')?.status).toBe('TICKET');
    expect(state.fetch.mock.calls.every(([url]) => String(url).endsWith('/getReceipts'))).toBe(true);
    expect(state.prepare).not.toHaveBeenCalled();
  });
  it('backs off provider failures, bounds retries and expires stale work', async () => {
    const state = setup();
    state.add('1');
    state.fetch.mockResolvedValue(new Response('provider detail must not leak', { status: 503 }));
    for (let attempt = 0; attempt < 6; attempt++)
      await state.dispatcher.run(new Date(now.getTime() + attempt * 2 * 60 * 60_000));
    expect(state.jobs.get('1')).toMatchObject({ status: 'FAILED', attempts: 6 });
    state.add('old');
    await state.dispatcher.run(new Date(now.getTime() + 24 * 60 * 60_000));
    expect(state.jobs.get('old')?.status).toBe('FAILED');
    expect(state.fetch).toHaveBeenCalledTimes(6);
  });
});
