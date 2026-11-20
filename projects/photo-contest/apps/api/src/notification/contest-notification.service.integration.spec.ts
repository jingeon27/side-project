import dayjs from 'dayjs';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { createTestApp, type ITestApi } from '../../test/support/app';
import { createContest, createGroup } from '../../test/support/fixtures';
import { ContestNotificationService } from './contest-notification.service';

describe('대회 시작·종료 알림', () => {
  let api: ITestApi;
  beforeAll(async () => {
    api = await createTestApp();
  });
  afterAll(async () => api?.close());

  it('시작·종료 시점에 현재 멤버에게 한 번씩 보내고 동시 실행에도 중복되지 않아야 한다', async () => {
    const owner = await api.signIn('일정알림관리'),
      member = await api.signIn('일정알림회원');
    const group = await createGroup(api, owner, '일정알림 그룹', [member]);
    const id = await createContest(api, owner, group.id, '알림 시점 대회');
    const start = dayjs().add(60_000, 'millisecond').toDate(),
      end = dayjs(start).add(120_000, 'millisecond').toDate();
    await api.db.contest.update({
      where: { id },
      data: {
        startsAt: start,
        submissionEndsAt: dayjs(start).add(60_000, 'millisecond').toDate(),
        endsAt: end,
      },
    });
    const worker = api.app.get(ContestNotificationService);
    await worker.sendDue(dayjs(start).subtract(1, 'millisecond').toDate());
    expect(await api.db.notification.count({ where: { contestId: id } })).toBe(0);
    await Promise.all([worker.sendDue(start), worker.sendDue(start)]);
    expect(await api.db.notification.count({ where: { contestId: id, type: 'CONTEST_STARTED' } })).toBe(2);
    await Promise.all([worker.sendDue(end), worker.sendDue(end)]);
    expect(await api.db.notification.count({ where: { contestId: id, type: 'CONTEST_ENDED' } })).toBe(2);
    await worker.sendDue(dayjs(end).add(1000, 'millisecond').toDate());
    expect(await api.db.notification.count({ where: { contestId: id } })).toBe(4);
  });

  it('이미 끝난 대회를 뒤늦게 처리할 때 시작 알림을 함께 보내지 않아야 한다', async () => {
    const owner = await api.signIn('종료알림관리');
    const group = await createGroup(api, owner, '종료알림 그룹');
    const id = await createContest(api, owner, group.id, '늦게 처리한 대회');
    const now = dayjs().toDate();
    await api.db.groupMember.update({
      where: { groupId_userId: { groupId: group.id, userId: owner.id } },
      data: { joinedAt: dayjs(now).subtract(240_000, 'millisecond').toDate() },
    });
    await api.db.contest.update({
      where: { id },
      data: {
        startsAt: dayjs(now).subtract(180_000, 'millisecond').toDate(),
        submissionEndsAt: dayjs(now).subtract(120_000, 'millisecond').toDate(),
        endsAt: dayjs(now).subtract(60_000, 'millisecond').toDate(),
      },
    });
    await api.app.get(ContestNotificationService).sendDue(now);
    expect(await api.db.notification.findMany({ where: { contestId: id }, select: { type: true } })).toEqual([
      { type: 'CONTEST_ENDED' },
    ]);
  });
});
