import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

import { createTestApp, type ITestApi, type ITestUser } from '../../../test/support/app';
import { createGroup } from '../../../test/support/fixtures';
import { createGroupContest, moveGroupContest } from '../../../test/support/group-contest';
import { GroupContestService } from './group-contest.service';

const PUBLIC_CONTESTS = '{publicGroupContests(limit:48){id winners{rank winner voteCount post{id}}}}';
const RESULTS = 'query($id:ID!){groupContestResults(contestId:$id){rank winner voteCount post{id}}}';

describe('그룹 대회 수상작', () => {
  let api: ITestApi;
  let owner: ITestUser;
  let voters: ITestUser[];
  let groupId: string;

  beforeAll(async () => {
    api = await createTestApp();
    owner = await api.signIn('수상작-그룹장');
    voters = [];
    for (const index of Array.from({ length: 8 }, (_, value) => value))
      voters.push(await api.signIn(`수상작-투표자${index}`));
    groupId = (await createGroup(api, owner, '수상작 공개 그룹', voters)).id;
  });

  afterAll(async () => {
    await api?.close();
  });

  /** 같은 그룹 글을 대회 참여작으로 만들고 고른 투표자들이 한 표씩 던진 것으로 둔다(대회당 한 사람 한 표). */
  const entry = async (
    contestId: string,
    title: string,
    from: number,
    to: number,
    createdAt = new Date(),
  ) => {
    const post = await api.db.post.create({
      data: {
        groupId,
        authorId: owner.id,
        title,
        linkUrl: 'https://example.com/entry',
        contestId,
        createdAt,
      },
    });
    for (const voter of voters.slice(from, to))
      await api.db.postContestVote.create({ data: { contestId, postId: post.id, voterId: voter.id } });
    return post;
  };

  it('목록의 우승작은 최다 득표 공동 우승만 한 번에 집계하고 숨긴 글·무투표 대회는 비워야 한다', async () => {
    const decided = await createGroupContest(api, owner, groupId, '공동 우승 대회');
    const silent = await createGroupContest(api, owner, groupId, '무투표 대회');
    const base = Date.parse('2026-10-01T00:00:00Z');
    const later = await entry(decided, '늦게 낸 공동 우승', 0, 2, new Date(base + 2000));
    const earlier = await entry(decided, '먼저 낸 공동 우승', 2, 4, new Date(base + 1000));
    await entry(decided, '한 표', 4, 5, new Date(base));
    // 표를 가장 많이 받았어도 숨긴 참여작은 결과에서 빠진다.
    const hidden = await entry(decided, '숨긴 글', 5, 8, new Date(base));
    await api.db.post.update({ where: { id: hidden.id }, data: { hidden: true } });
    await entry(silent, '표 없는 글', 0, 0, new Date(base));
    for (const id of [decided, silent]) await moveGroupContest(api, id, 'COMPLETED');

    const winnersOf = vi.spyOn(
      api.app.get(GroupContestService) as unknown as { winnersOf: () => Promise<unknown> },
      'winnersOf',
    );
    const { publicGroupContests } = await api.gqlOk<{
      publicGroupContests: Array<{ id: string; winners: Array<{ voteCount: number; post: { id: string } }> }>;
    }>(undefined, PUBLIC_CONTESTS);
    expect(winnersOf).toHaveBeenCalledTimes(1);
    const winners = (id: string) => publicGroupContests.find((contest) => contest.id === id)?.winners;
    expect(winners(decided)).toEqual([
      { rank: 1, winner: true, voteCount: 2, post: { id: earlier.id } },
      { rank: 1, winner: true, voteCount: 2, post: { id: later.id } },
    ]);
    expect(winners(silent)).toEqual([]);

    // 결과 화면의 우승 표시와 같은 규칙이다.
    const { groupContestResults } = await api.gqlOk<{
      groupContestResults: Array<{ winner: boolean; post: { id: string } }>;
    }>(undefined, RESULTS, { id: decided });
    expect(groupContestResults.filter((result) => result.winner).map(({ post }) => post.id)).toEqual([
      earlier.id,
      later.id,
    ]);
  });
});
