import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { createTestApp, type ITestApi, type ITestUser } from '../../test/support/app';
import { createGroup } from '../../test/support/fixtures';
import {
  CAST_POST_VOTE,
  createEntry,
  createGroupContest,
  GROUP_CONTEST,
  moveGroupContest,
} from '../../test/support/group-contest';

const HIDE = 'mutation($id:ID!,$hidden:Boolean!){setPostHidden(postId:$id,hidden:$hidden)}';
const RESULTS = 'query($id:ID!){groupContestResults(contestId:$id){voteCount post{id}}}';

interface IContestState {
  canVote: boolean;
  votedPostId: string | null;
}

describe('GroupContestService 투표 회귀', () => {
  let api: ITestApi;
  let owner: ITestUser;
  let author: ITestUser;
  let voter: ITestUser;
  let groupId: string;

  beforeAll(async () => {
    api = await createTestApp();
    owner = await api.signIn('숨김투표-그룹장');
    author = await api.signIn('숨김투표-참가자');
    voter = await api.signIn('숨김투표-투표자');
    groupId = (await createGroup(api, owner, '숨김 투표 그룹', [author, voter])).id;
  });

  afterAll(async () => {
    await api?.close();
  });

  it('투표한 작품이 숨겨지면 다시 투표할 수 있고 대회당 한 표만 남아야 한다', async () => {
    // 숨긴 작품의 표는 결과에서 빠지는데 (contestId,voterId) 한 표에 묶여 다시 투표하지 못했다.
    const id = await createGroupContest(api, owner, groupId, '숨김 투표 대회');
    const hidden = await createEntry(api, author, groupId, id);
    const visible = await createEntry(api, owner, groupId, id);
    await moveGroupContest(api, id, 'VOTING');
    await api.gqlOk(voter.cookie, CAST_POST_VOTE, { id, postId: hidden.id });
    expect((await api.gqlFail(voter.cookie, CAST_POST_VOTE, { id, postId: visible.id })).code).toBe(
      'CONFLICT',
    );

    await api.gqlOk(owner.cookie, HIDE, { id: hidden.id, hidden: true });
    const { groupContest } = await api.gqlOk<{ groupContest: IContestState }>(voter.cookie, GROUP_CONTEST, {
      id,
    });
    expect(groupContest).toMatchObject({ canVote: true, votedPostId: null });
    const voted = await api.gqlOk<{ castGroupContestVote: IContestState }>(voter.cookie, CAST_POST_VOTE, {
      id,
      postId: visible.id,
    });
    expect(voted.castGroupContestVote).toMatchObject({ canVote: false, votedPostId: visible.id });
    expect(
      await api.db.postContestVote.findMany({
        where: { contestId: id, voterId: voter.id },
        select: { postId: true },
      }),
    ).toEqual([{ postId: visible.id }]);

    await moveGroupContest(api, id, 'COMPLETED');
    const { groupContestResults } = await api.gqlOk<{
      groupContestResults: Array<{ voteCount: number; post: { id: string } }>;
    }>(voter.cookie, RESULTS, { id });
    expect(groupContestResults).toEqual([{ voteCount: 1, post: { id: visible.id } }]);
  });
});
