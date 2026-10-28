import { randomUUID } from 'node:crypto';

import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { createTestApp, type ITestApi, type ITestUser } from '../../test/support/app';
import { moveContestTo } from '../../test/support/clock';
import { createContest, createGroup } from '../../test/support/fixtures';
import {
  CAST_POST_VOTE,
  createGroupContest,
  GROUP_CONTEST,
  moveGroupContest,
} from '../../test/support/group-contest';
import { ERROR_MESSAGE } from '../common/errors';

const CAST_VOTE =
  'mutation($contestId:ID!,$submissionId:ID!){castVote(contestId:$contestId,submissionId:$submissionId){id}}';
const ANONYMOUS_VOTE = { code: 'UNAUTHENTICATED', message: ERROR_MESSAGE.ANONYMOUS_VOTE_FORBIDDEN };

describe('익명 계정의 대회 투표', () => {
  let api: ITestApi;
  let owner: ITestUser;
  let anonymous: ITestUser;
  let member: ITestUser;
  let groupId: string;

  beforeAll(async () => {
    api = await createTestApp();
    owner = await api.signIn('익명투표-그룹장');
    member = await api.signIn('익명투표-회원');
    anonymous = await api.signIn('익명투표-익명', { anonymous: true });
    groupId = (await createGroup(api, owner, '익명 투표 공개 그룹', [member])).id;
    // 익명 계정도 공개 그룹에는 바로 가입한다.
    await api.gqlOk(anonymous.cookie, 'mutation($id:ID!){requestGroupMembership(groupId:$id){id}}', {
      id: groupId,
    });
  });

  afterAll(async () => {
    await api?.close();
  });

  it('그룹 대회는 멤버인 익명 계정에도 투표를 열지 않고 로그인을 안내해야 한다', async () => {
    const contestId = await createGroupContest(api, owner, groupId, '익명 투표 대회');
    const entry = await api.db.post.create({
      data: { groupId, authorId: owner.id, title: '참여작', linkUrl: 'https://example.com/entry', contestId },
    });
    await moveGroupContest(api, contestId, 'VOTING');
    expect(
      (
        await api.gqlOk<{ groupContest: { canVote: boolean } }>(anonymous.cookie, GROUP_CONTEST, {
          id: contestId,
        })
      ).groupContest.canVote,
    ).toBe(false);
    expect(await api.gqlFail(anonymous.cookie, CAST_POST_VOTE, { id: contestId, postId: entry.id })).toEqual(
      ANONYMOUS_VOTE,
    );
    expect(await api.db.postContestVote.count({ where: { contestId, voterId: anonymous.id } })).toBe(0);
    // 회원은 그대로 투표한다.
    expect(
      (
        await api.gqlOk<{ castGroupContestVote: { votedPostId: string } }>(member.cookie, CAST_POST_VOTE, {
          id: contestId,
          postId: entry.id,
        })
      ).castGroupContestVote.votedPostId,
    ).toBe(entry.id);
  });

  it('기존 대회도 익명 계정의 투표를 받지 않아야 한다', async () => {
    const contestId = await createContest(api, owner, groupId, '익명 기존 대회');
    const upload = await api.db.upload.create({
      data: { tokenHash: randomUUID(), userId: owner.id, contestId, expiresAt: new Date() },
    });
    const photo = await api.db.submission.create({
      data: { contestId, authorId: owner.id, caption: '기존 사진', uploadId: upload.id },
    });
    await moveContestTo(api, contestId, 'VOTING');
    expect(await api.gqlFail(anonymous.cookie, CAST_VOTE, { contestId, submissionId: photo.id })).toEqual(
      ANONYMOUS_VOTE,
    );
    expect(await api.db.vote.count({ where: { contestId, voterId: anonymous.id } })).toBe(0);
  });
});
