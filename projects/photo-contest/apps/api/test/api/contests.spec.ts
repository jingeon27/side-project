import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { createTestApp } from '../support/app';
import type { ITestApi, ITestUser } from '../support/app';
import { moveContestTo, setSubmittedAt } from '../support/clock';
import { CREATE_CONTEST, contestSchedule, createContest, createGroup } from '../support/fixtures';
import type { ITestGroup } from '../support/fixtures';
import { listPhotos, submitPhoto } from '../support/photos';

const GROUP_FORBIDDEN = { code: 'FORBIDDEN', message: '이 그룹에 접근할 권한이 없습니다.' };
const INVALID_SCHEDULE = {
  code: 'BAD_USER_INPUT',
  message: '시작, 제출 마감, 투표 마감 순서로 90일 이내의 기간을 설정해 주세요.',
};
const MINUTE_MS = 60 * 1000;
const DAY_MS = 24 * 60 * MINUTE_MS;

const CAST_VOTE =
  'mutation($contestId: ID!, $submissionId: ID!) { castVote(contestId: $contestId, submissionId: $submissionId) { id } }';
const HIDE = 'mutation($id: ID!) { hideSubmission(submissionId: $id) }';

interface IViewerFields {
  phase: string;
  isAdmin: boolean;
  mySubmissionId: string | null;
  votedSubmissionId: string | null;
  submissionCount: number;
}

describe('대회', () => {
  let api: ITestApi;
  let owner: ITestUser;
  let member: ITestUser;
  let voter: ITestUser;
  let outsider: ITestUser;
  let group: ITestGroup;

  beforeAll(async () => {
    api = await createTestApp();
    owner = await api.signIn('대회-관리자');
    member = await api.signIn('대회-멤버');
    voter = await api.signIn('대회-투표자');
    outsider = await api.signIn('대회-외부인');
    group = await createGroup(api, owner, '대회 그룹', [member, voter]);
  });

  afterAll(async () => {
    await api?.close();
  });

  function viewerFields(cookie: string, contestId: string) {
    return api
      .gqlOk<{ contest: IViewerFields }>(
        cookie,
        'query($id: ID!) { contest(id: $id) { phase isAdmin mySubmissionId votedSubmissionId submissionCount } }',
        { id: contestId },
      )
      .then(({ contest }) => contest);
  }

  it('비회원의 대회 접근과 일반 멤버의 대회 생성을 거부해야 한다', async () => {
    const variables = { groupId: group.id, title: '웃긴 순간', ...contestSchedule() };
    expect(await api.gqlFail(member.cookie, CREATE_CONTEST, variables)).toEqual(GROUP_FORBIDDEN);
    expect(await api.gqlFail(outsider.cookie, CREATE_CONTEST, variables)).toEqual(GROUP_FORBIDDEN);

    const created = await api.gqlOk<{ createContest: { id: string; phase: string } }>(
      owner.cookie,
      CREATE_CONTEST,
      variables,
    );
    expect(created.createContest.phase).toBe('SUBMISSION');

    const query = 'query($id: ID!) { contest(id: $id) { title } }';
    expect(await api.gqlFail(outsider.cookie, query, { id: created.createContest.id })).toEqual(
      GROUP_FORBIDDEN,
    );
    expect(await api.gqlFail(member.cookie, query, { id: 'missing-contest' })).toEqual({
      code: 'NOT_FOUND',
      message: '대회를 찾을 수 없습니다.',
    });
  });

  it('권한을 입력 검사보다 먼저 확인해야 한다', async () => {
    const variables = { groupId: group.id, title: '', ...contestSchedule(Date.now() - DAY_MS) };
    expect(await api.gqlFail(member.cookie, CREATE_CONTEST, variables)).toEqual(GROUP_FORBIDDEN);
  });

  it('일정은 시작·제출 마감·투표 마감 순서로 90일 이내여야 하고 시작은 지금 이후여야 한다', async () => {
    const now = Date.now();
    const iso = (offset: number) => new Date(now + offset).toISOString();
    const invalid = [
      { startsAt: iso(-2 * MINUTE_MS), submissionEndsAt: iso(DAY_MS), endsAt: iso(2 * DAY_MS) },
      { startsAt: iso(DAY_MS), submissionEndsAt: iso(DAY_MS), endsAt: iso(2 * DAY_MS) },
      { startsAt: iso(0), submissionEndsAt: iso(2 * DAY_MS), endsAt: iso(DAY_MS) },
      { startsAt: iso(0), submissionEndsAt: iso(DAY_MS), endsAt: iso(DAY_MS) },
      { startsAt: iso(0), submissionEndsAt: iso(DAY_MS), endsAt: iso(90 * DAY_MS + MINUTE_MS) },
    ];
    for (const schedule of invalid)
      expect(
        await api.gqlFail(owner.cookie, CREATE_CONTEST, {
          groupId: group.id,
          title: '일정 검사',
          ...schedule,
        }),
        JSON.stringify(schedule),
      ).toEqual(INVALID_SCHEDULE);

    // 폼을 채우는 사이 막 지난 시작 시각(1분 이내)과 딱 90일은 받는다.
    const accepted = await api.gqlOk<{ createContest: { phase: string } }>(owner.cookie, CREATE_CONTEST, {
      groupId: group.id,
      title: '유예 시작',
      startsAt: iso(-30 * 1000),
      submissionEndsAt: iso(DAY_MS),
      endsAt: iso(90 * DAY_MS - 30 * 1000),
    });
    expect(accepted.createContest.phase).toBe('SUBMISSION');

    // 변수 변환 오류는 graphql-js가 변수 이름을 앞에 붙여 감싼다.
    expect(
      await api.gqlFail(owner.cookie, CREATE_CONTEST, {
        groupId: group.id,
        title: '날짜 아님',
        ...contestSchedule(),
        startsAt: 'not-a-date',
      }),
    ).toEqual({ code: 'BAD_USER_INPUT', message: expect.stringContaining('올바른 날짜를 입력해 주세요.') });
  });

  it('대회 제목은 앞뒤 공백을 지우고 1~80자여야 한다', async () => {
    const created = await api.gqlOk<{ createContest: { id: string } }>(owner.cookie, CREATE_CONTEST, {
      groupId: group.id,
      title: '  공백 제목  ',
      ...contestSchedule(),
    });
    expect(
      await api.gqlOk(owner.cookie, 'query($id: ID!) { contest(id: $id) { title } }', {
        id: created.createContest.id,
      }),
    ).toEqual({ contest: { title: '공백 제목' } });
    for (const title of ['', '가'.repeat(81)])
      expect(
        await api.gqlFail(owner.cookie, CREATE_CONTEST, { groupId: group.id, title, ...contestSchedule() }),
      ).toEqual({ code: 'BAD_USER_INPUT', message: '대회 제목은(는) 1~80자여야 합니다.' });
  });

  it('단계는 저장하지 않고 서버 시각으로 계산해야 한다', async () => {
    const contestId = await createContest(api, owner, group.id, '단계 대회');
    for (const phase of ['UPCOMING', 'SUBMISSION', 'VOTING', 'COMPLETED'] as const) {
      await moveContestTo(api, contestId, phase);
      expect((await viewerFields(member.cookie, contestId)).phase).toBe(phase);
    }
  });

  it('제출 기간에는 투표와 결과·득표수를 공개하지 않아야 한다', async () => {
    const contestId = await createContest(api, owner, group.id, '비공개 득표 대회');
    const ownerPhoto = await submitPhoto(api, owner, contestId, '관리자의 사진');
    await submitPhoto(api, member, contestId, '멤버의 사진');

    expect(await api.gqlFail(voter.cookie, CAST_VOTE, { contestId, submissionId: ownerPhoto })).toEqual({
      code: 'BAD_USER_INPUT',
      message: '투표 기간이 아닙니다.',
    });
    const resultsQuery = 'query($id: ID!) { contestResults(contestId: $id) { voteCount } }';
    expect(await api.gqlFail(member.cookie, resultsQuery, { id: contestId })).toEqual({
      code: 'BAD_USER_INPUT',
      message: '대회가 끝난 후 결과를 확인할 수 있습니다.',
    });
    expect(await listPhotos(api, member.cookie, contestId, 'voteCount reportCount')).toEqual([
      { voteCount: null, reportCount: null },
      { voteCount: null, reportCount: null },
    ]);

    // 투표 기간에도 결과와 득표수는 닫혀 있다.
    await moveContestTo(api, contestId, 'VOTING');
    await api.gqlOk(voter.cookie, CAST_VOTE, { contestId, submissionId: ownerPhoto });
    expect(await api.gqlFail(member.cookie, resultsQuery, { id: contestId })).toMatchObject({
      message: '대회가 끝난 후 결과를 확인할 수 있습니다.',
    });
    const voting = await listPhotos<{ voteCount: number | null }>(api, owner.cookie, contestId, 'voteCount');
    expect(voting.every(({ voteCount }) => voteCount === null)).toBe(true);
  });

  it('조회한 사용자 기준의 관리자 여부·내 사진·내 투표·사진 수를 돌려줘야 한다', async () => {
    const contestId = await createContest(api, owner, group.id, '조회자 필드 대회');
    expect(await viewerFields(owner.cookie, contestId)).toEqual({
      phase: 'SUBMISSION',
      isAdmin: true,
      mySubmissionId: null,
      votedSubmissionId: null,
      submissionCount: 0,
    });
    const memberPhoto = await submitPhoto(api, member, contestId, '멤버 사진');
    const ownerPhoto = await submitPhoto(api, owner, contestId, '관리자 사진');
    await moveContestTo(api, contestId, 'VOTING');
    await api.gqlOk(voter.cookie, CAST_VOTE, { contestId, submissionId: memberPhoto });

    expect(await viewerFields(member.cookie, contestId)).toEqual({
      phase: 'VOTING',
      isAdmin: false,
      mySubmissionId: memberPhoto,
      votedSubmissionId: null,
      submissionCount: 2,
    });
    expect(await viewerFields(voter.cookie, contestId)).toMatchObject({
      mySubmissionId: null,
      votedSubmissionId: memberPhoto,
    });

    await api.gqlOk(owner.cookie, HIDE, { id: ownerPhoto });
    expect((await viewerFields(voter.cookie, contestId)).submissionCount).toBe(1);
  });

  it('숨긴 사진은 관리자에게만 최신순으로 주고 득표수는 종료 후에만 보여줘야 한다', async () => {
    const contestId = await createContest(api, owner, group.id, '숨긴 사진 대회');
    const older = await submitPhoto(api, member, contestId, '먼저 숨긴 사진');
    const newer = await submitPhoto(api, voter, contestId, '나중 숨긴 사진');
    await setSubmittedAt(api, older, new Date(Date.now() - 10 * MINUTE_MS));
    await moveContestTo(api, contestId, 'VOTING');
    await api.gqlOk(owner.cookie, CAST_VOTE, { contestId, submissionId: newer });
    for (const id of [older, newer]) await api.gqlOk(owner.cookie, HIDE, { id });

    const query =
      'query($id: ID!) { contest(id: $id) { hiddenSubmissions { id hidden voteCount reportCount } } }';
    expect(await api.gqlOk(owner.cookie, query, { id: contestId })).toEqual({
      contest: {
        hiddenSubmissions: [
          { id: newer, hidden: true, voteCount: null, reportCount: 0 },
          { id: older, hidden: true, voteCount: null, reportCount: 0 },
        ],
      },
    });
    expect(await api.gqlOk(member.cookie, query, { id: contestId })).toEqual({
      contest: { hiddenSubmissions: [] },
    });

    await moveContestTo(api, contestId, 'COMPLETED');
    const completed = await api.gqlOk<{
      contest: { hiddenSubmissions: Array<{ id: string; voteCount: number }> };
    }>(owner.cookie, query, { id: contestId });
    expect(completed.contest.hiddenSubmissions.map(({ id, voteCount }) => ({ id, voteCount }))).toEqual([
      { id: newer, voteCount: 1 },
      { id: older, voteCount: 0 },
    ]);
  });

  it('그룹의 대회 목록은 최근에 만든 대회부터 보여줘야 한다', async () => {
    const listed = await createGroup(api, owner, '대회 목록 그룹', [member]);
    const first = await createContest(api, owner, listed.id, '첫 대회');
    const second = await createContest(api, owner, listed.id, '둘째 대회');
    expect(
      await api.gqlOk(member.cookie, 'query($id: ID!) { group(id: $id) { contests { id title isAdmin } } }', {
        id: listed.id,
      }),
    ).toEqual({
      group: {
        contests: [
          { id: second, title: '둘째 대회', isAdmin: false },
          { id: first, title: '첫 대회', isAdmin: false },
        ],
      },
    });
  });
});
