import {
  createTestImage,
  createTestVideo,
  createTestUser,
  graphqlRequest,
  moveTestContest,
} from '@photo-contest/test-kit';
import { ApolloClient, InMemoryCache } from '@apollo/client';
import UploadHttpLink from 'apollo-upload-client/UploadHttpLink.mjs';
import { print } from 'graphql';
import type { TypedDocumentNode } from '@graphql-typed-document-node/core';
import { beforeAll, describe, expect, inject, it } from 'vitest';

import {
  CreatePostDocument,
  UploadPostMediaDocument,
  UploadSubmissionPhotoDocument,
  RegisterWithPasswordDocument,
  LoginWithPasswordDocument,
  DeletePostDocument,
  GalleryPostsDocument,
  LikePostDocument,
  UnlikePostDocument,
  CreatePostCommentDocument,
  DeletePostCommentDocument,
  PostCommentsDocument,
  PostSort,
  RequestPostUploadDocument,
  CastVoteDocument,
  ContestDocument,
  ContestResultsDocument,
  CreateContestDocument,
  CreateGroupDocument,
  CreateSubmissionDocument,
  DeleteSubmissionDocument,
  GroupDocument,
  GalleryDocument,
  GroupLeaderboardDocument,
  HideSubmissionDocument,
  InvitePreviewDocument,
  JoinGroupDocument,
  LikeSubmissionDocument,
  MeDocument,
  MyGroupsDocument,
  MyPhotoFeedDocument,
  RegenerateInviteLinkDocument,
  ReportSubmissionDocument,
  RequestUploadDocument,
  SubmissionSort,
  SubmissionsDocument,
  UnlikeSubmissionDocument,
} from './generated';

const url = inject('apiUrl');
const origin = 'http://localhost:3321';

async function execute<TData, TVariables extends Record<string, unknown>>(
  document: TypedDocumentNode<TData, TVariables>,
  cookie: string | undefined,
  variables: TVariables,
) {
  return graphqlRequest<TData>(url, { query: print(document), cookie, variables, origin });
}

async function ok<TData, TVariables extends Record<string, unknown>>(
  document: TypedDocumentNode<TData, TVariables>,
  cookie: string | undefined,
  variables: TVariables,
) {
  const result = await execute(document, cookie, variables);
  if (!result.data || result.errors?.length) throw new Error(JSON.stringify(result.errors));
  return result.data;
}

async function uploadMutation<TData, TVariables extends Record<string, unknown>>(
  document: TypedDocumentNode<TData, TVariables>,
  cookie: string,
  variables: TVariables,
) {
  const client = new ApolloClient({
    cache: new InMemoryCache(),
    link: new UploadHttpLink({
      uri: `${url}/graphql`,
      headers: { Cookie: cookie, Origin: origin, 'Apollo-Require-Preflight': 'true' },
    }),
  });
  try {
    return await client.mutate({ mutation: document, variables });
  } finally {
    client.stop();
  }
}

async function submit(cookie: string, contestId: string, caption: string) {
  const { requestUploadUrl: ticket } = await ok(RequestUploadDocument, cookie, { contestId });
  expect(
    (
      await uploadMutation(UploadSubmissionPhotoDocument, cookie, {
        uploadId: ticket.id,
        file: new File([new Uint8Array(await createTestImage())], 'image.png', { type: 'image/png' }),
      })
    ).data?.uploadSubmissionPhoto,
  ).toBe(true);
  return (
    await ok(CreateSubmissionDocument, cookie, {
      contestId,
      uploadId: ticket.id,
      caption,
      rightsConfirmed: true,
    })
  ).createSubmission;
}

describe('웹 GraphQL 문서의 실제 API 계약', () => {
  let owner: string,
    member: string,
    outsider: string,
    groupId: string,
    inviteToken: string,
    contestId: string;
  beforeAll(async () => {
    owner = await createTestUser(url, { nickname: '문서-관리자', origin });
    member = await createTestUser(url, { nickname: '문서-멤버', origin });
    outsider = await createTestUser(url, { nickname: '문서-외부인', origin });
    const group = (await ok(CreateGroupDocument, owner, { name: '문서 계약 그룹' })).createGroup;
    groupId = group.id;
    const token = (await ok(GroupDocument, owner, { id: groupId })).group.inviteToken;
    if (!token) throw new Error('그룹장의 초대 토큰이 있어야 한다');
    inviteToken = token;
    await ok(JoinGroupDocument, member, { token: inviteToken });
    const now = Date.now();
    const contest = await ok(CreateContestDocument, owner, {
      groupId,
      title: '문서 계약 대회',
      startsAt: new Date(now).toISOString(),
      submissionEndsAt: new Date(now + 3_600_000).toISOString(),
      endsAt: new Date(now + 7_200_000).toISOString(),
    });
    contestId = contest.createContest.id;
  });

  it('직접 가입·로그인 문서가 개발 로그인 없이도 실행돼야 한다', async () => {
    const variables = {
      loginId: 'document_account',
      password: '기억할 수 있는 나만의 긴 비밀번호',
      nickname: '직접 가입',
    };
    const registered = (await ok(RegisterWithPasswordDocument, undefined, variables)).registerWithPassword;
    expect(
      (
        await ok(LoginWithPasswordDocument, undefined, {
          loginId: 'DOCUMENT_ACCOUNT',
          password: variables.password,
        })
      ).loginWithPassword.id,
    ).toBe(registered.id);
    expect(
      (await execute(LoginWithPasswordDocument, undefined, { loginId: variables.loginId, password: 'wrong' }))
        .errors?.[0]?.extensions?.code,
    ).toBe('UNAUTHENTICATED');
  });
  it('사용자·그룹·초대 문서가 실제 세션과 멤버십을 반영해야 한다', async () => {
    expect((await ok(MeDocument, owner, {})).me?.nickname).toBe('문서-관리자');
    expect((await ok(MeDocument, undefined, {})).me).toBeNull();
    expect((await ok(MyGroupsDocument, member, {})).myGroups.map(({ id }) => id)).toContain(groupId);
    const group = (await ok(GroupDocument, member, { id: groupId })).group;
    expect(group.role).toBe('MEMBER');
    expect(group.members.map(({ user }) => user.nickname).sort()).toEqual(['문서-관리자', '문서-멤버']);
    expect((await ok(InvitePreviewDocument, undefined, { token: inviteToken })).invitePreview).toMatchObject({
      groupName: '문서 계약 그룹',
      memberCount: 2,
      joinedGroupId: null,
    });
  });

  it('비회원은 그룹·대회·사진 문서로 사적인 내용을 읽을 수 없어야 한다', async () => {
    const responses = await Promise.all([
      execute(GroupDocument, outsider, { id: groupId }),
      execute(ContestDocument, outsider, { id: contestId }),
      execute(SubmissionsDocument, outsider, {
        contestId,
        sort: SubmissionSort.Newest,
        offset: 0,
        limit: 24,
      }),
      execute(ContestResultsDocument, outsider, { contestId }),
    ]);
    for (const response of responses) {
      expect(response.data).toBeNull();
      expect(response.errors?.[0]?.extensions?.code).toBe('FORBIDDEN');
    }
  });

  it('제출·좋아요·투표·결과·순위·신고·숨김·삭제 문서가 실제 흐름을 처리해야 한다', async () => {
    const ownerPhoto = await submit(owner, contestId, '관리자의 사진');
    const memberPhoto = await submit(member, contestId, '멤버의 사진');
    expect(ownerPhoto.voteCount).toBeNull();
    const like = (await ok(LikeSubmissionDocument, member, { submissionId: ownerPhoto.id })).likeSubmission;
    expect(like).toMatchObject({ likeCount: 1, likedByMe: true });
    const popular = await ok(SubmissionsDocument, member, {
      contestId,
      sort: SubmissionSort.MostLiked,
      offset: 0,
      limit: 1,
    });
    expect(popular.submissions.map(({ id }) => id)).toEqual([ownerPhoto.id]);
    expect(
      (await ok(UnlikeSubmissionDocument, member, { submissionId: ownerPhoto.id })).unlikeSubmission
        .likeCount,
    ).toBe(0);
    await moveTestContest(url, { contestId, phase: 'VOTING', origin });
    await ok(CastVoteDocument, member, { contestId, submissionId: ownerPhoto.id });
    expect((await ok(ContestDocument, member, { id: contestId })).contest.votedSubmissionId).toBe(
      ownerPhoto.id,
    );
    await moveTestContest(url, { contestId, phase: 'COMPLETED', origin });
    const results = (await ok(ContestResultsDocument, owner, { contestId })).contestResults;
    expect(results.map(({ rank, voteCount, winner }) => ({ rank, voteCount, winner }))).toEqual([
      { rank: 1, voteCount: 1, winner: true },
      { rank: 2, voteCount: 0, winner: false },
    ]);
    expect((await ok(GroupLeaderboardDocument, member, { groupId })).group.leaderboard[0]).toMatchObject({
      wins: 1,
      votesReceived: 1,
      user: { nickname: '문서-관리자' },
    });
    await ok(ReportSubmissionDocument, member, { submissionId: ownerPhoto.id, reason: '문서 계약 신고' });
    expect(
      (await ok(ContestResultsDocument, member, { contestId })).contestResults.every(
        ({ submission }) => submission.reports === null,
      ),
    ).toBe(true);
    await ok(HideSubmissionDocument, owner, { submissionId: ownerPhoto.id });
    expect(
      (await ok(ContestResultsDocument, member, { contestId })).contestResults.map(
        ({ submission }) => submission.id,
      ),
    ).toEqual([memberPhoto.id]);
    expect(
      (await ok(ContestDocument, owner, { id: contestId })).contest.hiddenSubmissions.map(({ id }) => id),
    ).toContain(ownerPhoto.id);
    expect(
      (await fetch(`${url}${ownerPhoto.imageUrl.replace(/^\/backend/, '')}`, { headers: { Cookie: member } }))
        .status,
    ).toBe(404);
    expect(
      (await ok(DeleteSubmissionDocument, owner, { submissionId: ownerPhoto.id })).deleteSubmission,
    ).toBe(true);
  });

  it('초대 재발급 문서는 이전 링크를 무효화해야 한다', async () => {
    const newToken = (await ok(RegenerateInviteLinkDocument, owner, { groupId })).regenerateInviteLink
      .inviteToken;
    expect(newToken).not.toBe(inviteToken);
    if (!newToken) throw new Error('새 초대 토큰이 있어야 한다');
    expect(
      (await execute(InvitePreviewDocument, undefined, { token: inviteToken })).errors?.[0]?.extensions?.code,
    ).toBe('NOT_FOUND');
    expect((await ok(InvitePreviewDocument, member, { token: newToken })).invitePreview.joinedGroupId).toBe(
      groupId,
    );
  });

  it('홈 피드 문서는 가입한 모든 그룹의 공개 사진을 최신순으로 이어 받아야 한다', async () => {
    const groups = [];
    for (const name of ['홈 피드 첫 그룹', '홈 피드 둘째 그룹']) {
      const group = (await ok(CreateGroupDocument, owner, { name })).createGroup;
      const token = (await ok(GroupDocument, owner, { id: group.id })).group.inviteToken;
      if (!token) throw new Error('그룹장의 초대 토큰이 있어야 한다');
      await ok(JoinGroupDocument, member, { token });
      const now = Date.now();
      const contest = (
        await ok(CreateContestDocument, owner, {
          groupId: group.id,
          title: name + ' 대회',
          startsAt: new Date(now).toISOString(),
          submissionEndsAt: new Date(now + 3_600_000).toISOString(),
          endsAt: new Date(now + 7_200_000).toISOString(),
        })
      ).createContest;
      const photo = await submit(owner, contest.id, name + ' 사진');
      groups.push({ group, photo });
    }
    const newer = groups[1];
    const older = groups[0];
    if (!newer || !older) throw new Error('피드 준비 실패');
    const first = await ok(MyPhotoFeedDocument, member, { offset: 0, limit: 1 });
    const second = await ok(MyPhotoFeedDocument, member, { offset: 1, limit: 1 });
    expect(first.myPhotoFeed[0]).toMatchObject({
      groupId: newer.group.id,
      submission: { id: newer.photo.id },
    });
    expect(second.myPhotoFeed[0]).toMatchObject({
      groupId: older.group.id,
      submission: { id: older.photo.id },
    });
    expect((await ok(MyPhotoFeedDocument, outsider, { offset: 0, limit: 24 })).myPhotoFeed).toEqual([]);
    await ok(HideSubmissionDocument, owner, { submissionId: newer.photo.id });
    expect(
      (await ok(MyPhotoFeedDocument, owner, { offset: 0, limit: 24 })).myPhotoFeed.some(
        ({ id }) => id === newer.photo.id,
      ),
    ).toBe(false);
  });
  it('기간 없는 사진·동영상 게시물과 이달의 인기·관리자 삭제 문서가 실행돼야 한다', async () => {
    expect((await ok(GalleryDocument, member, { id: groupId })).group.name).toBe('문서 계약 그룹');
    const variables = { groupId, sort: PostSort.Newest, offset: 0, limit: 24 };
    const created = [];
    for (const video of [false, true]) {
      const ticket = (await ok(RequestPostUploadDocument, member, { groupId })).requestPostUpload;
      const uploaded = await uploadMutation(UploadPostMediaDocument, member, {
        uploadId: ticket.id,
        file: new File(
          [new Uint8Array(video ? await createTestVideo() : await createTestImage())],
          video ? 'video.mp4' : 'image.png',
          { type: video ? 'video/mp4' : 'image/png' },
        ),
      });
      expect(uploaded.data?.uploadPostMedia).toBe(true);
      const post = (
        await ok(CreatePostDocument, member, {
          groupId,
          uploadId: ticket.id,
          title: video ? '움직이는 순간' : '합성도 환영',
          body: '상시 게시물',
          rightsConfirmed: true,
        })
      ).createPost;
      expect(post.kind).toBe(video ? 'VIDEO' : 'PHOTO');
      created.push(post);
    }
    const photo = created[0];
    if (!photo) throw new Error('사진 준비 실패');
    expect((await ok(GalleryPostsDocument, owner, variables)).galleryPosts.map((p) => p.id)).toEqual(
      created.map((p) => p.id).reverse(),
    );
    expect((await ok(LikePostDocument, owner, { postId: photo.id })).likePost.likeCount).toBe(1);
    expect(
      (await ok(GalleryPostsDocument, owner, { ...variables, sort: PostSort.MonthlyPopular })).galleryPosts[0]
        ?.id,
    ).toBe(photo.id);
    expect((await ok(UnlikePostDocument, owner, { postId: photo.id })).unlikePost.likeCount).toBe(0);
    expect(
      (await ok(GalleryPostsDocument, outsider, variables)).galleryPosts.find((post) => post.id === photo.id),
    ).toMatchObject({ canInteract: false, canDelete: false, likedByMe: false });
    expect(
      (await execute(LikePostDocument, outsider, { postId: photo.id })).errors?.[0]?.extensions?.code,
    ).toBe('FORBIDDEN');
    const comment = (
      await ok(CreatePostCommentDocument, member, { postId: photo.id, body: '문서로 남긴 댓글' })
    ).createPostComment;
    expect(comment.canDelete).toBe(true);
    const commentVariables = { postId: photo.id, offset: 0, limit: 24 };
    expect((await ok(PostCommentsDocument, owner, commentVariables)).postComments).toEqual([comment]);
    expect(
      (await ok(GalleryPostsDocument, owner, variables)).galleryPosts.find(({ id }) => id === photo.id)
        ?.commentCount,
    ).toBe(1);
    expect((await ok(PostCommentsDocument, outsider, commentVariables)).postComments).toEqual([
      { ...comment, canDelete: false },
    ]);
    expect(
      (await execute(CreatePostCommentDocument, outsider, { postId: photo.id, body: '가입 전 댓글' }))
        .errors?.[0]?.extensions?.code,
    ).toBe('FORBIDDEN');
    expect(
      (await execute(DeletePostCommentDocument, outsider, { commentId: comment.id })).errors?.[0]?.extensions
        ?.code,
    ).toBe('FORBIDDEN');
    expect((await ok(DeletePostCommentDocument, owner, { commentId: comment.id })).deletePostComment).toBe(
      true,
    );
    expect((await ok(PostCommentsDocument, member, commentVariables)).postComments).toEqual([]);
    await ok(DeletePostDocument, owner, { postId: photo.id });
    expect(
      (await ok(GalleryPostsDocument, member, variables)).galleryPosts.some((p) => p.id === photo.id),
    ).toBe(false);
  });
});
