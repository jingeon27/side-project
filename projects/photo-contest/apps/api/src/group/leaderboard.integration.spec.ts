import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { createTestApp, type ITestApi, type ITestUser } from '../../test/support/app';
import { moveContestTo } from '../../test/support/clock';
import { castVote, createContest, createGroup, hidePhoto, likePhoto } from '../../test/support/fixtures';
import { submitPhoto } from '../../test/support/photos';

const LEADERBOARD = `
  query($id: ID!) {
    group(id: $id) {
      leaderboard { rank user { id nickname } wins votesReceived likesReceived submissions }
    }
  }
`;

interface ILeaderboardEntry {
  rank: number;
  user: { id: string; nickname: string };
  wins: number;
  votesReceived: number;
  likesReceived: number;
  submissions: number;
}

describe('그룹 순위', () => {
  let api: ITestApi;
  let owner: ITestUser;
  let ara: ITestUser;
  let bora: ITestUser;
  let chan: ITestUser;
  let voter: ITestUser;

  beforeAll(async () => {
    api = await createTestApp();
    owner = await api.signIn('순위-관리자');
    ara = await api.signIn('순위-아라');
    bora = await api.signIn('순위-보라');
    chan = await api.signIn('순위-찬');
    voter = await api.signIn('순위-투표자');
  });

  afterAll(async () => {
    await api?.close();
  });

  async function leaderboard(viewer: ITestUser, groupId: string) {
    const { group } = await api.gqlOk<{ group: { leaderboard: ILeaderboardEntry[] } }>(
      viewer.cookie,
      LEADERBOARD,
      {
        id: groupId,
      },
    );
    return group.leaderboard;
  }

  function entry(user: ITestUser, totals: Omit<ILeaderboardEntry, 'user'>): ILeaderboardEntry {
    return { ...totals, user: { id: user.id, nickname: user.nickname } };
  }

  it('끝난 대회의 보이는 사진만 모아 우승·받은 표·받은 좋아요 순으로 경쟁 순위를 매겨야 한다', async () => {
    const group = await createGroup(api, owner, '순위 그룹', [ara, bora, chan, voter]);

    // 1회: 아라·찬 공동 우승(2표씩), 보라는 1표지만 좋아요 3개
    const first = await createContest(api, owner, group.id, '순위 1회');
    const ara1 = await submitPhoto(api, ara, first, '아라 1회');
    const bora1 = await submitPhoto(api, bora, first, '보라 1회');
    const chan1 = await submitPhoto(api, chan, first, '찬 1회');
    await likePhoto(api, ara1, [bora]);
    await likePhoto(api, bora1, [ara, chan, voter]);
    await moveContestTo(api, first, 'VOTING');
    await castVote(api, owner, first, ara1);
    await castVote(api, voter, first, ara1);
    await castVote(api, chan, first, bora1);
    await castVote(api, ara, first, chan1);
    await castVote(api, bora, first, chan1);
    await moveContestTo(api, first, 'COMPLETED');

    // 2회: 보라 우승(2표), 아라 1표
    const second = await createContest(api, owner, group.id, '순위 2회');
    const ara2 = await submitPhoto(api, ara, second, '아라 2회');
    const bora2 = await submitPhoto(api, bora, second, '보라 2회');
    await likePhoto(api, ara2, [voter]);
    await moveContestTo(api, second, 'VOTING');
    await castVote(api, owner, second, bora2);
    await castVote(api, voter, second, bora2);
    await castVote(api, chan, second, ara2);
    await moveContestTo(api, second, 'COMPLETED');

    // 3회: 표를 가장 많이 받은 보라의 사진을 숨겨 아라의 0표 사진만 남는다 → 우승 없음
    const third = await createContest(api, owner, group.id, '순위 3회');
    await submitPhoto(api, ara, third, '아라 3회');
    const bora3 = await submitPhoto(api, bora, third, '보라 3회');
    await likePhoto(api, bora3, [ara, chan]);
    await moveContestTo(api, third, 'VOTING');
    await castVote(api, owner, third, bora3);
    await hidePhoto(api, owner, bora3);
    await moveContestTo(api, third, 'COMPLETED');

    // 아직 투표 중인 대회는 세지 않는다.
    const ongoing = await createContest(api, owner, group.id, '순위 진행 중');
    const chanOngoing = await submitPhoto(api, chan, ongoing, '찬 진행 중');
    await likePhoto(api, chanOngoing, [ara, bora]);
    await moveContestTo(api, ongoing, 'VOTING');
    await castVote(api, owner, ongoing, chanOngoing);
    await castVote(api, voter, ongoing, chanOngoing);

    const expected = [
      entry(bora, { rank: 1, wins: 1, votesReceived: 3, likesReceived: 3, submissions: 2 }),
      entry(ara, { rank: 1, wins: 1, votesReceived: 3, likesReceived: 2, submissions: 3 }),
      entry(chan, { rank: 3, wins: 1, votesReceived: 2, likesReceived: 0, submissions: 1 }),
    ];
    expect(await leaderboard(voter, group.id)).toEqual(expected);
    // 사진을 낸 적 없는 관리자·투표자는 나오지 않고, 누가 보든 같다.
    expect(await leaderboard(owner, group.id)).toEqual(expected);
  });

  it('우승·표·좋아요가 모두 같으면 닉네임 순이고 같은 순위여야 한다', async () => {
    const group = await createGroup(api, owner, '닉네임 순위 그룹', [ara, bora, chan]);
    const contestId = await createContest(api, owner, group.id, '닉네임 순위');
    for (const author of [chan, ara, bora])
      await submitPhoto(api, author, contestId, `${author.nickname} 사진`);
    await moveContestTo(api, contestId, 'COMPLETED');

    const sorted = [ara, bora, chan].sort((a, b) => (a.nickname < b.nickname ? -1 : 1));
    expect(await leaderboard(ara, group.id)).toEqual(
      sorted.map((user) =>
        entry(user, { rank: 1, wins: 0, votesReceived: 0, likesReceived: 0, submissions: 1 }),
      ),
    );
  });

  it('끝난 대회가 없으면 빈 순위여야 하고 비회원은 볼 수 없어야 한다', async () => {
    const group = await createGroup(api, owner, '빈 순위 그룹', [ara]);
    const contestId = await createContest(api, owner, group.id, '아직 진행 중');
    await submitPhoto(api, ara, contestId, '진행 중 사진');
    expect(await leaderboard(ara, group.id)).toEqual([]);
    expect(await api.gqlFail(chan.cookie, LEADERBOARD, { id: group.id })).toEqual({
      code: 'FORBIDDEN',
      message: '이 그룹에 접근할 권한이 없습니다.',
    });
  });
});
