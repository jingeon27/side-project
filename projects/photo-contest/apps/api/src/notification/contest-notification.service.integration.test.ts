import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

import { createTestApp, type ITestApi } from '../../test/support/app';
import { createGroup } from '../../test/support/fixtures';
import { createGroupContest } from '../../test/support/group-contest';
import { UnitOfWork } from '../database/unit-of-work';
import { ContestNotificationService } from './contest-notification.service';

const MINUTE_MS = 60_000;

describe('ContestNotificationService 회귀', () => {
  let api: ITestApi;
  beforeAll(async () => {
    api = await createTestApp();
  });
  afterAll(async () => api?.close());

  it('한 대회의 알림 쓰기가 실패해도 다음 대회는 보내고 실패한 대회는 늦춰 다시 시도해야 한다', async () => {
    // 대회마다 Serializable 트랜잭션 하나에 모든 알림을 쓰고 예외를 잡지 않아, 시작이 가장 이른 대회 하나가
    // 실패하면 매 주기 같은 대회에서 멈춰 뒤의 대회 알림이 나가지 않았다.
    const owner = await api.signIn('알림정지-관리자');
    const member = await api.signIn('알림정지-회원');
    const group = await createGroup(api, owner, '알림정지 그룹', [member]);
    const stuck = await createGroupContest(api, owner, group.id, '먼저 실패할 대회');
    const next = await createGroupContest(api, owner, group.id, '다음 대회');
    // 다른 파일의 대회보다 앞서 처리되도록 시작 시각을 아주 이르게 둔다. 종료는 아직이다.
    const endsAt = new Date(Date.now() + 120 * MINUTE_MS);
    for (const [id, startsAt] of [
      [stuck, new Date('2000-01-01T00:00:00Z')],
      [next, new Date('2000-01-01T00:01:00Z')],
    ] as const)
      await api.db.contest.update({
        where: { id },
        data: {
          startsAt,
          submissionEndsAt: new Date(endsAt.getTime() - MINUTE_MS),
          endsAt,
          startNotifiedAt: null,
        },
      });
    const worker = api.app.get(ContestNotificationService);
    const started = (contestId: string) =>
      api.db.notification.count({ where: { contestId, type: 'CONTEST_STARTED' } });

    vi.spyOn(api.app.get(UnitOfWork), 'run').mockRejectedValueOnce(new Error('알림 쓰기 실패'));
    const now = new Date();
    await expect(worker.sendDue(now)).resolves.toBeGreaterThanOrEqual(2);
    expect(await started(stuck)).toBe(0);
    expect(await started(next)).toBe(2);
    expect(await api.db.contest.findUniqueOrThrow({ where: { id: stuck } })).toMatchObject({
      startNotifiedAt: null,
    });

    // 기다리는 동안에는 다시 잡지 않고, 대기가 지나면 같은 알림을 한 번씩만 보낸다.
    await worker.sendDue(new Date(now.getTime() + 30_000));
    expect(await started(stuck)).toBe(0);
    await worker.sendDue(new Date(now.getTime() + MINUTE_MS + 1000));
    expect(await started(stuck)).toBe(2);
    expect(await started(next)).toBe(2);
    expect((await api.db.contest.findUniqueOrThrow({ where: { id: stuck } })).startNotifiedAt).not.toBeNull();
  });
});
