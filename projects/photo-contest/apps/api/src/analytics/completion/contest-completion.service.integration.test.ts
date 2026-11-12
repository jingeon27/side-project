import dayjs from 'dayjs';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

import { createTestApp, type ITestApi } from '../../../test/support/app';
import { createGroup } from '../../../test/support/fixtures';
import { createGroupContest } from '../../../test/support/group-contest';
import { ContestCompletionService } from './contest-completion.service';
import { PostCompletionReader } from './post-completion.reader';

describe('ContestCompletionService 회귀', () => {
  let api: ITestApi;
  beforeAll(async () => {
    api = await createTestApp();
  });
  afterAll(async () => api?.close());

  it('한 대회의 종료 기록이 계속 실패해도 뒤 대회는 기록하고 실패한 대회는 다음 실행에 기록해야 한다', async () => {
    // 대회마다 트랜잭션을 실행하면서 실패를 잡지 않아, 종료가 가장 이른 대회 하나가 계속 실패하면
    // 매 주기 같은 대회에서 멈춰 뒤 대회의 contest_completed가 남지 않았다.
    const owner = await api.signIn('종료기록정지-관리자');
    const group = await createGroup(api, owner, '종료기록정지 그룹');
    const stuck = await createGroupContest(api, owner, group.id, '먼저 실패할 대회');
    const next = await createGroupContest(api, owner, group.id, '다음 대회');
    // 다른 파일이 남긴 끝난 대회가 있어도 두 대회가 한 묶음에 들고 stuck이 먼저 처리되도록
    // 아주 이른 시각에 끝난 대회로 옮긴다.
    for (const [id, endsAt] of [
      [stuck, dayjs('2000-01-01T00:00:00Z')],
      [next, dayjs('2000-01-01T00:01:00Z')],
    ] as const)
      await api.db.contest.update({
        where: { id },
        data: {
          startsAt: endsAt.subtract(2, 'hour').toDate(),
          submissionEndsAt: endsAt.subtract(1, 'hour').toDate(),
          endsAt: endsAt.toDate(),
          // 대회 알림 작업이 보낼 대상으로 잡지 않게 알림은 보낸 것으로 둔다. 시작이 2000년보다 이르므로 비워 두면
          // 같은 DB에서 시작이 가장 이른 대회부터 처리한다고 보는 알림 회귀 테스트의 순서를 앞지른다.
          startNotifiedAt: endsAt.toDate(),
          endNotifiedAt: endsAt.toDate(),
        },
      });
    const worker = api.app.get(ContestCompletionService);
    const completed = (contestId: string) =>
      api.db.analyticsEvent.count({ where: { type: 'contest_completed', id: `completed:${contestId}` } });

    // 실행 순서나 다른 파일이 남긴 대회에 기대지 않도록 stuck의 집계만 실패시킨다.
    const reader = api.app.get(PostCompletionReader);
    const read = reader.read.bind(reader);
    const failure = new Error('종료 기록 실패');
    const failing = vi.spyOn(reader, 'read').mockImplementation(async (client, contestId) => {
      if (contestId === stuck) throw failure;
      return read(client, contestId);
    });
    try {
      await expect(worker.recordCompletedContests()).rejects.toBe(failure);
    } finally {
      failing.mockRestore();
    }
    expect(await completed(stuck)).toBe(0);
    expect(await completed(next)).toBe(1);
    expect(await api.db.contest.findUniqueOrThrow({ where: { id: stuck } })).toMatchObject({
      completionTrackedAt: null,
    });

    await worker.recordCompletedContests();
    expect(await completed(stuck)).toBe(1);
    expect(await completed(next)).toBe(1);
  });
});
