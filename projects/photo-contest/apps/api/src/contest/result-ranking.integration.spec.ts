import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { createTestApp } from '../../test/support/app';
import type { ITestApi, ITestUser } from '../../test/support/app';
import { minutesFrom, moveContestTo, setSubmittedAt } from '../../test/support/clock';
import { castVote, createContest, createGroup, hidePhoto, likePhoto } from '../../test/support/fixtures';
import type { ITestGroup } from '../../test/support/fixtures';
import { submitPhoto } from '../../test/support/photos';

const RESULTS = `
  query($id: ID!) {
    contestResults(contestId: $id) { rank voteCount winner submission { id likeCount voteCount } }
  }
`;
const CAST_VOTE = 'mutation($c: ID!, $s: ID!) { castVote(contestId: $c, submissionId: $s) { id } }';
const NOT_COMPLETED = { code: 'BAD_USER_INPUT', message: '대회가 끝난 후 결과를 확인할 수 있습니다.' };

interface IResult {
  rank: number;
  voteCount: number;
  winner: boolean;
  submission: { id: string; likeCount: number; voteCount: number | null };
}

describe('대회 결과', () => {
  let api: ITestApi;
  let owner: ITestUser;
  let ara: ITestUser;
  let bora: ITestUser;
  let chan: ITestUser;
  let dana: ITestUser;
  let eun: ITestUser;
  let outsider: ITestUser;
  let group: ITestGroup;

  beforeAll(async () => {
    api = await createTestApp();
    owner = await api.signIn('결과-관리자');
    ara = await api.signIn('결과-아라');
    bora = await api.signIn('결과-보라');
    chan = await api.signIn('결과-찬');
    dana = await api.signIn('결과-다나');
    eun = await api.signIn('결과-은');
    outsider = await api.signIn('결과-외부인');
    group = await createGroup(api, owner, '결과 그룹', [ara, bora, chan, dana, eun]);
  });

  afterAll(async () => {
    await api?.close();
  });

  async function results(viewer: ITestUser, contestId: string) {
    return (await api.gqlOk<{ contestResults: IResult[] }>(viewer.cookie, RESULTS, { id: contestId }))
      .contestResults;
  }

  /** authors가 한 장씩 낸 대회. 사진 ID를 작성자 순서대로 돌려준다. */
  async function contestWithPhotos(title: string, authors: readonly ITestUser[]) {
    const contestId = await createContest(api, owner, group.id, title);
    const photos: string[] = [];
    for (const author of authors)
      photos.push(await submitPhoto(api, author, contestId, `${title} ${author.nickname}`));
    return { contestId, photos };
  }

  it('투표 마감 후 공동 우승을 반환하고 늦은 투표를 거부해야 한다', async () => {
    const { contestId, photos } = await contestWithPhotos('공동 우승', [ara, bora]);
    const [araPhoto = '', boraPhoto = ''] = photos;
    await moveContestTo(api, contestId, 'VOTING');
    await castVote(api, owner, contestId, araPhoto);
    await castVote(api, chan, contestId, boraPhoto);
    await moveContestTo(api, contestId, 'COMPLETED');

    const ranked = await results(chan, contestId);
    expect(ranked.map(({ rank, voteCount, winner }) => ({ rank, voteCount, winner }))).toEqual([
      { rank: 1, voteCount: 1, winner: true },
      { rank: 1, voteCount: 1, winner: true },
    ]);
    expect(ranked.map((result) => result.submission.id).sort()).toEqual([araPhoto, boraPhoto].sort());

    expect(await api.gqlFail(dana.cookie, CAST_VOTE, { c: contestId, s: araPhoto })).toEqual({
      code: 'BAD_USER_INPUT',
      message: '투표 기간이 아닙니다.',
    });
    expect(await api.db.vote.count({ where: { contestId } })).toBe(2);
  });

  it('무투표 대회는 0표 사진을 보여주되 우승자를 만들지 않아야 한다', async () => {
    const { contestId, photos } = await contestWithPhotos('무투표', [ara, bora]);
    await moveContestTo(api, contestId, 'COMPLETED');
    const ranked = await results(owner, contestId);
    expect(ranked.map(({ rank, voteCount, winner }) => ({ rank, voteCount, winner }))).toEqual([
      { rank: 1, voteCount: 0, winner: false },
      { rank: 1, voteCount: 0, winner: false },
    ]);
    expect(ranked.map((result) => result.submission.id).sort()).toEqual([...photos].sort());
  });

  it('득표수가 같으면 같은 순위(1, 1, 3)이고 같은 순위 안에서는 좋아요가 많은 사진이 먼저여야 한다', async () => {
    const { contestId, photos } = await contestWithPhotos('경쟁 순위', [ara, bora, chan]);
    const [araPhoto = '', boraPhoto = '', chanPhoto = ''] = photos;
    await likePhoto(api, araPhoto, [eun]);
    await likePhoto(api, boraPhoto, [owner, dana]);
    await moveContestTo(api, contestId, 'VOTING');
    await castVote(api, owner, contestId, araPhoto);
    await castVote(api, dana, contestId, araPhoto);
    await castVote(api, eun, contestId, boraPhoto);
    await castVote(api, chan, contestId, boraPhoto);
    await castVote(api, ara, contestId, chanPhoto);
    await moveContestTo(api, contestId, 'COMPLETED');

    expect(await results(dana, contestId)).toEqual([
      { rank: 1, voteCount: 2, winner: true, submission: { id: boraPhoto, likeCount: 2, voteCount: 2 } },
      { rank: 1, voteCount: 2, winner: true, submission: { id: araPhoto, likeCount: 1, voteCount: 2 } },
      { rank: 3, voteCount: 1, winner: false, submission: { id: chanPhoto, likeCount: 0, voteCount: 1 } },
    ]);
  });

  it('득표수와 좋아요 수가 같으면 먼저 낸 사진, 같은 시각이면 id 순이어야 한다', async () => {
    const { contestId, photos } = await contestWithPhotos('제출 순서', [ara, bora, chan]);
    const [araPhoto = '', boraPhoto = '', chanPhoto = ''] = photos;
    const base = new Date('2026-01-01T00:00:00.000Z');
    await setSubmittedAt(api, boraPhoto, base);
    await setSubmittedAt(api, araPhoto, minutesFrom(base, 5));
    await setSubmittedAt(api, chanPhoto, minutesFrom(base, 5));
    await moveContestTo(api, contestId, 'COMPLETED');

    const sameTime = [araPhoto, chanPhoto].sort();
    expect((await results(owner, contestId)).map((result) => [result.rank, result.submission.id])).toEqual([
      [1, boraPhoto],
      [1, sameTime[0]],
      [1, sameTime[1]],
    ]);
  });

  it('결과는 끝난 대회에서만 보여주고 숨긴 사진은 관리자에게도 빼야 한다', async () => {
    const { contestId, photos } = await contestWithPhotos('숨김 결과', [ara, bora]);
    const [araPhoto = '', boraPhoto = ''] = photos;
    for (const phase of ['UPCOMING', 'SUBMISSION'] as const) {
      await moveContestTo(api, contestId, phase);
      expect(await api.gqlFail(owner.cookie, RESULTS, { id: contestId }), phase).toEqual(NOT_COMPLETED);
    }
    await moveContestTo(api, contestId, 'VOTING');
    expect(await api.gqlFail(owner.cookie, RESULTS, { id: contestId })).toEqual(NOT_COMPLETED);
    await castVote(api, owner, contestId, araPhoto);
    await castVote(api, chan, contestId, araPhoto);
    await castVote(api, dana, contestId, boraPhoto);
    await hidePhoto(api, owner, araPhoto);
    await moveContestTo(api, contestId, 'COMPLETED');

    for (const viewer of [owner, chan])
      expect(await results(viewer, contestId), viewer.nickname).toEqual([
        { rank: 1, voteCount: 1, winner: true, submission: { id: boraPhoto, likeCount: 0, voteCount: 1 } },
      ]);
  });

  it('비회원은 결과를 볼 수 없고 없는 대회는 NOT_FOUND여야 한다', async () => {
    const { contestId } = await contestWithPhotos('비회원 결과', [ara]);
    await moveContestTo(api, contestId, 'COMPLETED');
    expect(await api.gqlFail(outsider.cookie, RESULTS, { id: contestId })).toEqual({
      code: 'FORBIDDEN',
      message: '이 그룹에 접근할 권한이 없습니다.',
    });
    expect(await api.gqlFail(ara.cookie, RESULTS, { id: 'missing-contest' })).toEqual({
      code: 'NOT_FOUND',
      message: '대회를 찾을 수 없습니다.',
    });
  });

  it('결과를 본 사용자마다 result_viewed를 개인정보 없이 한 번만 기록해야 한다', async () => {
    const { contestId } = await contestWithPhotos('결과 이벤트', [ara]);
    await moveContestTo(api, contestId, 'COMPLETED');
    await results(bora, contestId);
    await results(bora, contestId);
    await results(chan, contestId);

    const events = await api.db.analyticsEvent.findMany({
      where: { type: 'result_viewed', properties: { path: ['contestId'], equals: contestId } },
      orderBy: { id: 'asc' },
    });
    expect(events.map(({ id, userId, properties }) => ({ id, userId, properties }))).toEqual(
      [bora, chan]
        .map((viewer) => ({
          id: `result:${contestId}:${viewer.id}`,
          userId: viewer.id,
          properties: { contestId, groupId: group.id },
        }))
        .sort((a, b) => (a.id < b.id ? -1 : 1)),
    );
  });
});
