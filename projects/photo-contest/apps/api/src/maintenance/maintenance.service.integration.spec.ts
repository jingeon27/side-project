import { createHash, randomBytes } from 'node:crypto';

import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

import { createTestApp, type ITestApi, type ITestUser } from '../../test/support/app';
import { moveContestTo } from '../../test/support/clock';
import { stubExternalFetch } from '../../test/support/external-fetch';
import {
  castVote,
  createContest,
  createGroup,
  hidePhoto,
  type ITestGroup,
} from '../../test/support/fixtures';
import { requestUpload, storedPhotoExists, submitPhoto, uploadPhoto } from '../../test/support/photos';
import { MaintenanceService } from './maintenance.service';

const MINUTE_MS = 60 * 1000;
const REPORT =
  'mutation($id: ID!, $reason: String!) { reportSubmission(submissionId: $id, reason: $reason) }';

function minutesAgo(minutes: number) {
  return new Date(Date.now() - minutes * MINUTE_MS);
}

function randomHash() {
  return createHash('sha256').update(randomBytes(16)).digest('hex');
}

describe('주기 작업', () => {
  let api: ITestApi;
  let owner: ITestUser;
  let ara: ITestUser;
  let bora: ITestUser;
  let chan: ITestUser;
  let group: ITestGroup;

  beforeAll(async () => {
    api = await createTestApp();
    owner = await api.signIn('정리-관리자');
    ara = await api.signIn('정리-아라');
    bora = await api.signIn('정리-보라');
    chan = await api.signIn('정리-찬');
    group = await createGroup(api, owner, '정리 작업 비밀 그룹', [ara, bora, chan]);
    // 앞선 파일들이 남긴 끝난 대회를 먼저 기록해 이 파일의 대회가 한 번 실행에 처리되게 한다.
    await drainCompletedContests();
  });

  afterAll(async () => {
    await api?.close();
  });

  async function drainCompletedContests() {
    for (let run = 0; run < 20; run++) {
      const pending = await api.db.contest.count({
        where: { endsAt: { lte: new Date() }, completionTrackedAt: null },
      });
      if (pending === 0) return;
      await api.runScheduledWork();
    }
    throw new Error('끝난 대회 기록이 밀려 있습니다.');
  }

  function completionEvents(contestId: string) {
    return api.db.analyticsEvent.findMany({
      where: { type: 'contest_completed', id: `completed:${contestId}` },
    });
  }

  it('종료 이벤트를 한 번만 개인정보 없이 DB에 기록하고 밖으로는 아무것도 보내지 않아야 한다', async () => {
    const outgoing = stubExternalFetch({});
    const contestId = await createContest(api, owner, group.id, '정리 작업 비밀 대회');
    const araPhoto = await submitPhoto(api, ara, contestId, '아라의 비밀 캡션');
    const boraPhoto = await submitPhoto(api, bora, contestId, '보라의 비밀 캡션');
    const chanPhoto = await submitPhoto(api, chan, contestId, '숨길 비밀 캡션');
    await api.gqlOk(owner.cookie, REPORT, { id: chanPhoto, reason: '비밀 신고 이유' });
    await moveContestTo(api, contestId, 'VOTING');
    await castVote(api, chan, contestId, araPhoto);
    await castVote(api, owner, contestId, boraPhoto);
    await castVote(api, ara, contestId, chanPhoto);
    await hidePhoto(api, owner, chanPhoto);

    await api.runScheduledWork();
    expect(await completionEvents(contestId)).toEqual([]);

    await moveContestTo(api, contestId, 'COMPLETED');
    await api.runScheduledWork();
    await api.runScheduledWork();

    const events = await completionEvents(contestId);
    // 숨긴 사진과 그 사진의 표는 세지 않는다. 참여자 = 보이는 사진의 작가(아라·보라) + 표를 센 투표자(찬·관리자)
    expect(events).toEqual([
      expect.objectContaining({
        type: 'contest_completed',
        userId: null,
        properties: {
          contestId,
          groupId: group.id,
          submissions: 2,
          votes: 2,
          participants: 4,
          activeContest: true,
        },
      }),
    ]);
    const contest = await api.db.contest.findUniqueOrThrow({ where: { id: contestId } });
    expect(contest.completionTrackedAt).toBeInstanceOf(Date);

    const { inviteToken } = await api.db.group.findUniqueOrThrow({ where: { id: group.id } });
    const recorded = JSON.stringify(await api.db.analyticsEvent.findMany());
    for (const secret of [
      '정리 작업 비밀 그룹',
      '정리 작업 비밀 대회',
      '비밀 캡션',
      '비밀 신고 이유',
      '정리-아라',
      inviteToken,
    ])
      expect(recorded, secret).not.toContain(secret);
    expect(outgoing).toEqual([]);
  });

  it('참여자가 3명보다 적은 대회는 활발하지 않은 대회로 기록해야 한다', async () => {
    const contestId = await createContest(api, owner, group.id, '조용한 대회');
    await submitPhoto(api, ara, contestId, '혼자 낸 사진');
    await moveContestTo(api, contestId, 'COMPLETED');
    await api.runScheduledWork();
    expect((await completionEvents(contestId)).map((event) => event.properties)).toEqual([
      { contestId, groupId: group.id, submissions: 1, votes: 0, participants: 1, activeContest: false },
    ]);
  });

  it('버려진 업로드는 티켓 만료 후 5분이 더 지난 뒤에만 파일과 함께 지워야 한다', async () => {
    const contestId = await createContest(api, owner, group.id, '업로드 정리 대회');
    const abandoned = await uploadPhoto(api, ara.cookie, contestId);
    const recent = await uploadPhoto(api, bora.cookie, contestId);
    const neverUploaded = (await requestUpload(api, chan.cookie, contestId)).id;
    const submitted = await submitPhoto(api, owner, contestId, '제출한 사진');
    const submittedUpload = await api.db.upload.findFirstOrThrow({
      where: { submission: { id: submitted } },
    });
    const keyOf = async (uploadId: string) =>
      (await api.db.upload.findUniqueOrThrow({ where: { id: uploadId } })).imageKey ?? '';
    const abandonedKey = await keyOf(abandoned);
    const recentKey = await keyOf(recent);

    for (const [id, expiresAt] of [
      [abandoned, minutesAgo(6)],
      [recent, minutesAgo(4)],
      [neverUploaded, minutesAgo(6)],
      [submittedUpload.id, minutesAgo(60)],
    ] as const)
      await api.db.upload.update({ where: { id }, data: { expiresAt } });

    await api.runScheduledWork();

    const remaining = await api.db.upload.findMany({ where: { contestId }, select: { id: true } });
    expect(remaining.map(({ id }) => id).sort()).toEqual([recent, submittedUpload.id].sort());
    expect(await storedPhotoExists(api, abandonedKey)).toBe(false);
    expect(await storedPhotoExists(api, recentKey)).toBe(true);
    expect(await storedPhotoExists(api, submittedUpload.imageKey ?? '')).toBe(true);
    expect((await api.http().get(`/photos/${submitted}`).set('Cookie', ara.cookie)).status).toBe(200);
  });

  it('만료된 세션·OAuth 시도·앱 로그인 티켓만 지워야 한다', async () => {
    const user = await api.signIn('정리-세션');
    const expiredSession = await api.db.session.create({
      data: { tokenHash: randomHash(), userId: user.id, expiresAt: minutesAgo(1) },
    });
    const expiredAttempt = await api.db.oAuthAttempt.create({
      data: { stateHash: randomHash(), provider: 'google', verifier: 'verifier', expiresAt: minutesAgo(1) },
    });
    const validAttempt = await api.db.oAuthAttempt.create({
      data: { stateHash: randomHash(), provider: 'kakao', verifier: 'verifier', expiresAt: minutesAgo(-10) },
    });
    const expiredTicket = await api.db.appLoginTicket.create({
      data: { codeHash: randomHash(), userId: user.id, challenge: 'challenge', expiresAt: minutesAgo(1) },
    });
    const validTicket = await api.db.appLoginTicket.create({
      data: { codeHash: randomHash(), userId: user.id, challenge: 'challenge', expiresAt: minutesAgo(-2) },
    });

    await api.runScheduledWork();

    expect(await api.db.session.count({ where: { tokenHash: expiredSession.tokenHash } })).toBe(0);
    expect(await api.db.oAuthAttempt.count({ where: { stateHash: expiredAttempt.stateHash } })).toBe(0);
    expect(await api.db.oAuthAttempt.count({ where: { stateHash: validAttempt.stateHash } })).toBe(1);
    expect(await api.db.appLoginTicket.count({ where: { codeHash: expiredTicket.codeHash } })).toBe(0);
    expect(await api.db.appLoginTicket.count({ where: { codeHash: validTicket.codeHash } })).toBe(1);
    // 로그인해 받은 유효한 세션은 그대로 쓸 수 있다.
    expect(await api.gqlOk(user.cookie, '{ me { id } }')).toEqual({ me: { id: user.id } });
  });

  it('겹쳐 요청해도 앞선 실행이 끝난 뒤 차례로 실행해야 한다', async () => {
    const steps: string[] = [];
    const cleanup = vi.spyOn(api.app.get(MaintenanceService), 'cleanup').mockImplementation(async () => {
      steps.push('start');
      await new Promise((resolve) => setTimeout(resolve, 30));
      steps.push('end');
    });
    try {
      await Promise.all([api.runScheduledWork(), api.runScheduledWork(), api.runScheduledWork()]);
      expect(steps).toEqual(['start', 'end', 'start', 'end', 'start', 'end']);
    } finally {
      cleanup.mockRestore();
    }
  });

  it('정리가 실패해도 종료 기록은 실행하고 처음 실패를 알려야 한다', async () => {
    const contestId = await createContest(api, owner, group.id, '정리 실패 대회');
    await submitPhoto(api, bora, contestId, '정리 실패 사진');
    await moveContestTo(api, contestId, 'COMPLETED');
    const cleanup = vi
      .spyOn(api.app.get(MaintenanceService), 'cleanup')
      .mockRejectedValueOnce(new Error('정리 실패'));
    try {
      await expect(api.runScheduledWork()).rejects.toThrow('정리 실패');
    } finally {
      cleanup.mockRestore();
    }
    expect(await completionEvents(contestId)).toHaveLength(1);
    // 실패한 실행이 다음 실행을 막지 않는다.
    await expect(api.runScheduledWork()).resolves.toBeUndefined();
  });
});
