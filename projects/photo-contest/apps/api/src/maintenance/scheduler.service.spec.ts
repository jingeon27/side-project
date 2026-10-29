import { EventEmitter, once } from 'node:events';

import { afterEach, describe, expect, it, vi } from 'vitest';

import type { ContestCompletionService } from '../analytics/completion/contest-completion.service';
import { MAINTENANCE_INTERVAL_MS } from '../config/limits';
import * as sentry from '../monitoring/sentry';
import type { ContestNotificationService } from '../notification/contest-notification.service';
import type { MaintenanceService } from './maintenance.service';
import { SchedulerService } from './scheduler.service';

function createScheduler(cleanup: () => Promise<unknown>) {
  const recordCompletedContests = vi.fn(async () => undefined);
  const sendDue = vi.fn(async () => undefined);
  const scheduler = new SchedulerService(
    { cleanup } as MaintenanceService,
    { recordCompletedContests } as unknown as ContestCompletionService,
    { sendDue } as unknown as ContestNotificationService,
  );
  return { scheduler, recordCompletedContests, sendDue };
}

afterEach(() => {
  vi.restoreAllMocks();
  vi.useRealTimers();
});

describe('SchedulerService', () => {
  it('실패 뒤에도 대기 작업을 직렬로 실행하고 종료는 마지막 작업까지 기다려야 한다', async () => {
    const first = new EventEmitter();
    const second = new EventEmitter();
    const cleanup = vi
      .fn()
      .mockImplementationOnce(() => once(first, 'release'))
      .mockImplementationOnce(() => once(second, 'release'));
    const { scheduler, recordCompletedContests, sendDue } = createScheduler(cleanup);
    const firstRun = scheduler.runOnce();
    const failed = expect(firstRun).rejects.toThrow('cleanup failed');
    const secondRun = scheduler.runOnce();
    const destroyed = vi.fn();
    const destroy = async () => {
      await scheduler.onModuleDestroy();
      destroyed();
    };
    await vi.waitFor(() => expect(cleanup).toHaveBeenCalledTimes(1));
    first.emit('error', new Error('cleanup failed'));
    await failed;
    await vi.waitFor(() => expect(cleanup).toHaveBeenCalledTimes(2));
    expect(recordCompletedContests).toHaveBeenCalledTimes(1);
    expect(sendDue).toHaveBeenCalledTimes(1);
    const shutdown = destroy();
    await Promise.resolve();
    await Promise.resolve();
    expect(destroyed).not.toHaveBeenCalled();
    second.emit('release');
    await secondRun;
    await shutdown;
    expect(recordCompletedContests).toHaveBeenCalledTimes(2);
    expect(sendDue).toHaveBeenCalledTimes(2);
    expect(destroyed).toHaveBeenCalledOnce();
  });

  it('진행 중인 작업은 타이머가 건너뛰고 완료 뒤에는 다시 실행해야 한다', async () => {
    vi.useFakeTimers();
    const pending = new EventEmitter();
    const cleanup = vi
      .fn()
      .mockImplementationOnce(() => once(pending, 'release'))
      .mockResolvedValue(undefined);
    const { scheduler } = createScheduler(cleanup);
    scheduler.start();
    await vi.advanceTimersByTimeAsync(MAINTENANCE_INTERVAL_MS * 3);
    expect(cleanup).toHaveBeenCalledOnce();
    pending.emit('release');
    await vi.advanceTimersByTimeAsync(0);
    await vi.advanceTimersByTimeAsync(MAINTENANCE_INTERVAL_MS);
    expect(cleanup).toHaveBeenCalledTimes(2);
    await scheduler.onModuleDestroy();
    await vi.advanceTimersByTimeAsync(MAINTENANCE_INTERVAL_MS);
    expect(cleanup).toHaveBeenCalledTimes(2);
  });

  it('다음 단계도 실행하고 추가 실패는 보고하며 첫 실패만 호출자에게 전달해야 한다', async () => {
    const first = new Error('first');
    const second = new Error('second');
    const report = vi.spyOn(sentry, 'reportUnexpectedError').mockImplementation(() => undefined);
    const { scheduler, recordCompletedContests, sendDue } = createScheduler(async () => {
      throw first;
    });
    recordCompletedContests.mockRejectedValueOnce(second);
    await expect(scheduler.runOnce()).rejects.toBe(first);
    expect(sendDue).toHaveBeenCalledOnce();
    expect(report).toHaveBeenCalledExactlyOnceWith(second, { job: 'maintenance' });
    await scheduler.onModuleDestroy();
  });
});
