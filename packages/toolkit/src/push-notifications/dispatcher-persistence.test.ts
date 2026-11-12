import dayjs from 'dayjs';
import { describe, expect, it, vi } from 'vitest';

import { ExpoPushTransport, PushDispatcher, type IPushJob, type IPushJobUpdate } from './index';

const now = dayjs('2026-11-12T00:00:00Z');

function setup(status = 'PENDING', jobCount = 3) {
  const jobs = Array.from({ length: jobCount }, (_, index) => String(index + 1)).map((id) => ({
    id,
    deviceId: `device-${id}`,
    eventId: `event-${id}`,
    status,
    ticketId: status === 'TICKET' ? `ticket-${id}` : null,
    attempts: 0,
    createdAt: now.toDate(),
    nextAttemptAt: now.toDate(),
    lease: null as string | null,
    leaseUntil: now.toDate(),
  }));
  const persist = vi.fn(async () => undefined);
  const disable = vi.fn(async () => undefined);
  const fetch = vi.fn<typeof globalThis.fetch>();
  const transport = new ExpoPushTransport({ fetch });
  const dispatcher = new PushDispatcher(
    {
      due: async (date) =>
        jobs
          .filter((job) => ['PENDING', 'TICKET'].includes(job.status) && job.nextAttemptAt <= date)
          .map((job) => ({ ...job })),
      claim: async (id, lease, date, until) => {
        const job = jobs.find((job) => job.id === id);
        if (!job || (job.lease && job.leaseUntil > date)) return false;
        Object.assign(job, { lease, leaseUntil: until });
        return true;
      },
      finish: async (id, lease, update: IPushJobUpdate) => {
        await persist();
        const job = jobs.find((job) => job.id === id);
        if (job?.lease === lease) Object.assign(job, update, { lease: null });
      },
      disable,
      prepare: async (job: IPushJob) => ({
        to: 'ExpoPushToken[aaaaaaaaaaaaaaaaaaaa]',
        title: '새 알림',
        body: '알림이 있어요.',
        data: { path: '/notifications', notificationId: job.eventId },
        badge: 1,
        sound: 'default' as const,
        channelId: 'activity',
      }),
    },
    transport,
  );
  return { jobs, persist, disable, fetch, transport, dispatcher };
}

describe('공급자 응답 이후 DB 장애 격리', () => {
  // 배치 크기는 dispatcher가 PUSH_BATCH_SIZE로 나눠 지키므로, 전송 계층이 던지는 다른 계약 오류로 같은 경계를 검사한다.
  it.each([
    ['PENDING', 'send'],
    ['TICKET', 'receipts'],
  ] as const)('%s 작업의 호출 계약 오류를 공급자 실패로 처리하지 않는다', async (status, method) => {
    const state = setup(status, 101);
    vi.spyOn(state.transport, method).mockRejectedValueOnce(new TypeError('전송 계약 위반'));
    await expect(state.dispatcher.run(now.toDate())).rejects.toBeInstanceOf(TypeError);
    expect(state.jobs.every((job) => job.status === status && job.attempts === 0)).toBe(true);
    expect(state.persist).not.toHaveBeenCalled();
    expect(state.fetch).not.toHaveBeenCalled();
  });

  it('티켓 저장 실패를 전송 실패로 덮어쓰지 않고 나머지 결과를 저장한 뒤 임대 만료 후 복구한다', async () => {
    const state = setup();
    const databaseError = new Error('database unavailable');
    state.persist.mockRejectedValueOnce(databaseError);
    state.fetch.mockResolvedValueOnce(
      Response.json({
        data: [
          { status: 'ok', id: 'accepted-1' },
          { status: 'error', details: { error: 'MessageRateExceeded' } },
          { status: 'ok', id: 'accepted-3' },
        ],
      }),
    );
    await expect(state.dispatcher.run(now.toDate())).rejects.toMatchObject({ errors: [databaseError] });
    expect(state.jobs[0]).toMatchObject({
      status: 'PENDING',
      attempts: 0,
      ticketId: null,
      lease: expect.any(String),
    });
    expect(state.jobs[1]).toMatchObject({ status: 'PENDING', attempts: 1, ticketId: null, lease: null });
    expect(state.jobs[2]).toMatchObject({
      status: 'TICKET',
      attempts: 0,
      ticketId: 'accepted-3',
      lease: null,
    });
    await state.dispatcher.run(now.toDate());
    expect(state.fetch).toHaveBeenCalledTimes(1);
    state.fetch.mockResolvedValueOnce(
      Response.json({
        data: [
          { status: 'ok', id: 'recovered-1' },
          { status: 'ok', id: 'recovered-2' },
        ],
      }),
    );
    await state.dispatcher.run(now.add(2, 'minutes').toDate());
    expect(state.jobs.map((job) => job.ticketId)).toEqual(['recovered-1', 'recovered-2', 'accepted-3']);
  });

  it('기기 비활성화 실패가 다른 기기의 티켓을 실패로 만들지 않는다', async () => {
    const state = setup();
    state.disable.mockRejectedValueOnce(new Error('database unavailable'));
    state.fetch.mockResolvedValueOnce(
      Response.json({
        data: [
          { status: 'error', details: { error: 'DeviceNotRegistered' } },
          { status: 'ok', id: 'accepted-2' },
          { status: 'ok', id: 'accepted-3' },
        ],
      }),
    );
    await expect(state.dispatcher.run(now.toDate())).rejects.toBeInstanceOf(AggregateError);
    expect(state.jobs.map((job) => job.status)).toEqual(['PENDING', 'TICKET', 'TICKET']);
    expect(state.jobs.map((job) => job.attempts)).toEqual([0, 0, 0]);
  });

  it('영수증 저장 실패를 숨기지 않고 다른 영수증은 확정하며 재조회로 복구한다', async () => {
    const state = setup('TICKET');
    state.persist.mockRejectedValueOnce(new Error('database unavailable'));
    state.fetch.mockImplementation(async () =>
      Response.json({
        data: {
          'ticket-1': { status: 'ok' },
          'ticket-2': { status: 'ok' },
          'ticket-3': { status: 'error', details: { error: 'DeviceNotRegistered' } },
        },
      }),
    );
    await expect(state.dispatcher.run(now.toDate())).rejects.toBeInstanceOf(AggregateError);
    expect(state.jobs.map((job) => job.status)).toEqual(['TICKET', 'DELIVERED', 'FAILED']);
    await state.dispatcher.run(now.add(2, 'minutes').toDate());
    expect(state.jobs.map((job) => job.status)).toEqual(['DELIVERED', 'DELIVERED', 'FAILED']);
    expect(state.fetch.mock.calls.every(([url]) => String(url).endsWith('/getReceipts'))).toBe(true);
  });
});
