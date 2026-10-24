import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { createTestApp, type ITestApi, type ITestUser } from '../../test/support/app';
import { moveContestTo } from '../../test/support/clock';
import { createContest, createGroup, type ITestGroup } from '../../test/support/fixtures';
import { submitPhoto } from '../../test/support/photos';

const CAST_VOTE = `
  mutation($contestId: ID!, $submissionId: ID!) {
    castVote(contestId: $contestId, submissionId: $submissionId) { id contestId submissionId }
  }
`;
const NOT_VOTABLE = { code: 'BAD_USER_INPUT', message: '투표할 수 없는 사진입니다.' };

describe('투표', () => {
  let api: ITestApi;
  let owner: ITestUser;
  let friend: ITestUser;
  let voter: ITestUser;
  let outsider: ITestUser;
  let group: ITestGroup;

  beforeAll(async () => {
    api = await createTestApp();
    owner = await api.signIn('투표-관리자');
    friend = await api.signIn('투표-친구');
    voter = await api.signIn('투표-투표자');
    outsider = await api.signIn('투표-외부인');
    group = await createGroup(api, owner, '투표 그룹', [friend, voter]);
  });

  afterAll(async () => {
    await api?.close();
  });

  /** 관리자와 친구가 사진을 한 장씩 낸 투표 기간 대회 */
  async function votingContest(title: string) {
    const contestId = await createContest(api, owner, group.id, title);
    const ownerPhoto = await submitPhoto(api, owner, contestId, `${title} 관리자 사진`);
    const friendPhoto = await submitPhoto(api, friend, contestId, `${title} 친구 사진`);
    await moveContestTo(api, contestId, 'VOTING');
    return { contestId, ownerPhoto, friendPhoto };
  }

  it('동시 투표는 정확히 한 요청만 성공하고 자기 사진은 거부해야 한다', async () => {
    const { contestId, ownerPhoto, friendPhoto } = await votingContest('동시 투표');
    expect(await api.gqlFail(owner.cookie, CAST_VOTE, { contestId, submissionId: ownerPhoto })).toEqual({
      code: 'BAD_USER_INPUT',
      message: '자신의 사진에는 투표할 수 없습니다.',
    });

    const attempts = await Promise.all(
      Array.from({ length: 8 }, () =>
        api.gql<{ castVote: { id: string } }>(voter.cookie, CAST_VOTE, {
          contestId,
          submissionId: ownerPhoto,
        }),
      ),
    );
    expect(attempts.filter((attempt) => attempt.data?.castVote)).toHaveLength(1);
    const failed = attempts.filter((attempt) => attempt.errors);
    expect(failed).toHaveLength(7);
    for (const attempt of failed) expect(attempt.errors?.[0]?.extensions?.code).toBe('CONFLICT');

    expect(await api.db.vote.count({ where: { contestId } })).toBe(1);
    expect(
      await api.db.analyticsEvent.count({
        where: {
          type: 'vote_cast',
          userId: voter.id,
          properties: { path: ['contestId'], equals: contestId },
        },
      }),
    ).toBe(1);
    expect(await api.gqlOk(owner.cookie, CAST_VOTE, { contestId, submissionId: friendPhoto })).toEqual({
      castVote: { id: expect.any(String), contestId, submissionId: friendPhoto },
    });
  });

  it('한 대회에서는 한 표만 던질 수 있어야 한다', async () => {
    const { contestId, ownerPhoto, friendPhoto } = await votingContest('한 표');
    await api.gqlOk(voter.cookie, CAST_VOTE, { contestId, submissionId: ownerPhoto });
    expect(await api.gqlFail(voter.cookie, CAST_VOTE, { contestId, submissionId: friendPhoto })).toEqual({
      code: 'CONFLICT',
      message: '이미 제출하거나 투표했습니다.',
    });
    expect(
      await api.gqlOk(voter.cookie, 'query($id: ID!) { contest(id: $id) { votedSubmissionId } }', {
        id: contestId,
      }),
    ).toEqual({ contest: { votedSubmissionId: ownerPhoto } });
  });

  it('숨긴 사진·다른 대회의 사진·없는 사진에는 투표할 수 없어야 한다', async () => {
    const { contestId, ownerPhoto, friendPhoto } = await votingContest('투표 대상');
    const other = await votingContest('다른 투표 대상');
    await api.gqlOk(owner.cookie, 'mutation($id: ID!) { hideSubmission(submissionId: $id) }', {
      id: friendPhoto,
    });

    for (const submissionId of [friendPhoto, other.ownerPhoto, 'missing-photo'])
      expect(await api.gqlFail(voter.cookie, CAST_VOTE, { contestId, submissionId }), submissionId).toEqual(
        NOT_VOTABLE,
      );
    expect(await api.db.vote.count({ where: { contestId } })).toBe(0);
    await api.gqlOk(voter.cookie, CAST_VOTE, { contestId, submissionId: ownerPhoto });
  });

  it('투표 기간이 아니면 투표할 수 없어야 한다', async () => {
    const { contestId, ownerPhoto } = await votingContest('기간 밖 투표');
    for (const phase of ['UPCOMING', 'SUBMISSION', 'COMPLETED'] as const) {
      await moveContestTo(api, contestId, phase);
      expect(
        await api.gqlFail(voter.cookie, CAST_VOTE, { contestId, submissionId: ownerPhoto }),
        phase,
      ).toEqual({
        code: 'BAD_USER_INPUT',
        message: '투표 기간이 아닙니다.',
      });
    }
  });

  it('비회원은 투표할 수 없고 없는 대회는 NOT_FOUND여야 한다', async () => {
    const { contestId, ownerPhoto } = await votingContest('비회원 투표');
    expect(await api.gqlFail(outsider.cookie, CAST_VOTE, { contestId, submissionId: ownerPhoto })).toEqual({
      code: 'NOT_FOUND',
      message: '대회를 찾을 수 없습니다.',
    });
    expect(
      await api.gqlFail(voter.cookie, CAST_VOTE, { contestId: 'missing-contest', submissionId: ownerPhoto }),
    ).toEqual({ code: 'NOT_FOUND', message: '대회를 찾을 수 없습니다.' });
  });
});
