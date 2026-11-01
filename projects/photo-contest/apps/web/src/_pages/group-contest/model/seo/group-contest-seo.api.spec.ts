import type { TypedDocumentNode } from '@graphql-typed-document-node/core';
import { print } from 'graphql';
import { afterEach, beforeAll, beforeEach, describe, expect, inject, it, vi } from 'vitest';

import {
  createTestImage,
  createTestUser,
  graphqlRequest,
  moveTestContest,
  uploadTestPostMedia,
} from '@photo-contest/test-kit';

import {
  CastGroupContestVoteDocument,
  CreateGroupContestDocument,
  CreateGroupDocument,
  CreatePostDocument,
  GroupContestDocument,
  GroupContestFilter,
  GroupContestResultsDocument,
  GroupContestsDocument,
  GroupRole,
  GroupVisibility,
  MeDocument,
  RequestGroupMembershipDocument,
  SetGroupModeratorDocument,
  TransferGroupOwnershipDocument,
} from '@/shared/api/generated';

import { getGroupContestSeoData } from './group-contest-seo.server';

const origin = 'http://localhost:3321';
let url: string;
let owner: string;
let member: string;
let publicId: string;
let privateId: string;
let contestId: string;
let privateContestId: string;
let postId: string;

async function execute<TResult, TVariables extends Record<string, unknown>>(
  cookie: string,
  document: TypedDocumentNode<TResult, TVariables>,
  variables: TVariables,
) {
  const result = await graphqlRequest<TResult>(url, { cookie, origin, query: print(document), variables });
  if (!result.data || result.errors?.length) throw new Error(JSON.stringify(result.errors));
  return result.data;
}
async function createContest(groupId: string, title: string) {
  const now = Date.now();
  return (
    await execute(owner, CreateGroupContestDocument, {
      groupId,
      title,
      startsAt: new Date(now - 1_000).toISOString(),
      submissionEndsAt: new Date(now + 3_600_000).toISOString(),
      endsAt: new Date(now + 7_200_000).toISOString(),
    })
  ).createGroupContest;
}

describe('생성 문서로 사용하는 그룹 대회·운영 권한·공개 SEO', () => {
  beforeAll(async () => {
    url = inject('apiUrl');
    owner = await createTestUser(url, { nickname: '대회 SEO 그룹장', origin });
    member = await createTestUser(url, { nickname: '대회 SEO 멤버', origin });
    publicId = (
      await execute(owner, CreateGroupDocument, { name: '대회 SEO 공개', visibility: GroupVisibility.Public })
    ).createGroup.id;
    privateId = (
      await execute(owner, CreateGroupDocument, {
        name: '대회 SEO 비공개',
        visibility: GroupVisibility.Private,
      })
    ).createGroup.id;
    await execute(member, RequestGroupMembershipDocument, { groupId: publicId });
    contestId = (await createContest(publicId, '검색할 수 있는 대회')).id;
    privateContestId = (await createContest(privateId, '검색하면 안 되는 대회')).id;
    const uploadId = await uploadTestPostMedia(url, {
      cookie: owner,
      origin,
      groupId: publicId,
      body: await createTestImage(),
      contentType: 'image/png',
    });
    postId = (
      await execute(owner, CreatePostDocument, {
        groupId: publicId,
        contestId,
        uploadId,
        title: '검색에 나올 참여작',
        rightsConfirmed: true,
      })
    ).createPost.id;
  });
  beforeEach(() => {
    vi.stubEnv('API_URL', url);
    vi.stubEnv('WEB_ORIGIN', origin);
  });
  afterEach(() => vi.unstubAllEnvs());

  it('익명 대회·참여작 조회와 그룹 경로 일치 여부를 확인해야 한다', async () => {
    const seo = await getGroupContestSeoData(publicId, contestId);
    expect(seo?.contest).toMatchObject({ title: '검색할 수 있는 대회', entryCount: 1 });
    expect(seo?.posts[0]).toMatchObject({
      id: postId,
      contestId,
      canModerate: false,
      canInteract: false,
      canDelete: false,
    });
    expect(await getGroupContestSeoData(publicId, privateContestId)).toBeNull();
    expect(await getGroupContestSeoData(publicId, 'missing-contest')).toBeNull();
  });

  it('그룹장도 비공개 대회의 SEO에는 대회·참여작 정보를 받지 않아야 한다', async () => {
    expect((await execute(owner, GroupContestDocument, { id: privateContestId })).groupContest.title).toBe(
      '검색하면 안 되는 대회',
    );
    expect(await getGroupContestSeoData(privateId, privateContestId)).toMatchObject({
      contest: null,
      posts: [],
    });
  });

  it('실제 투표와 종료를 거쳐 명예의 전당·수상작 SEO가 같은 결과를 읽어야 한다', async () => {
    await moveTestContest(url, { origin, contestId, phase: 'VOTING' });
    expect(
      (await execute(member, CastGroupContestVoteDocument, { contestId, postId })).castGroupContestVote,
    ).toMatchObject({ votedPostId: postId, canVote: false });
    await moveTestContest(url, { origin, contestId, phase: 'COMPLETED' });
    expect(
      (await execute('', GroupContestResultsDocument, { contestId })).groupContestResults[0],
    ).toMatchObject({ rank: 1, winner: true, voteCount: 1, post: { id: postId } });
    const hall = await execute('', GroupContestsDocument, {
      groupId: publicId,
      filter: GroupContestFilter.Completed,
      offset: 0,
      limit: 24,
    });
    expect(hall.groupContests[0]?.winners[0]?.post.id).toBe(postId);
    expect((await getGroupContestSeoData(publicId, contestId))?.contest?.winners[0]?.post.id).toBe(postId);
  });

  it('부관리자 임명과 관리자 양도 문서가 역할·대회 개최 권한을 갱신해야 한다', async () => {
    const userId = (await execute(member, MeDocument, {})).me?.id;
    if (!userId) throw new Error('멤버가 있어야 한다');
    const appointed = (
      await execute(owner, SetGroupModeratorDocument, { groupId: publicId, userId, enabled: true })
    ).setGroupModerator;
    expect(appointed.members.find((item) => item.user.id === userId)?.role).toBe(GroupRole.Moderator);
    const transferred = (await execute(owner, TransferGroupOwnershipDocument, { groupId: publicId, userId }))
      .transferGroupOwnership;
    expect(transferred.role).toBe(GroupRole.Member);
    expect(transferred.members.find((item) => item.user.id === userId)?.role).toBe(GroupRole.Owner);
  });

  it('API 장애는 없는 대회로 숨기지 않아야 한다', async () => {
    vi.stubEnv('API_URL', 'http://127.0.0.1:1');
    await expect(getGroupContestSeoData(publicId, contestId)).rejects.toThrow();
  });
});
