import type { TypedDocumentNode } from '@graphql-typed-document-node/core';
import { print } from 'graphql';
import { beforeAll, describe, expect, inject, it } from 'vitest';

import {
  createTestImage,
  createTestUser,
  createTestVideo,
  graphqlRequest,
  moveTestContest,
} from '@photo-contest/test-kit';

import {
  CastVoteDocument,
  CompleteGroupAvatarUploadDocument,
  CompletePostUploadDocument,
  CompleteSubmissionUploadDocument,
  ContestDocument,
  ContestResultsDocument,
  CreateContestDocument,
  CreateGroupContestDocument,
  CreateGroupDocument,
  CreatePostCommentDocument,
  CreatePostDocument,
  CreateSubmissionDocument,
  DeletePostCommentDocument,
  DeletePostDocument,
  DeleteSubmissionDocument,
  GalleryDocument,
  GalleryPostsDocument,
  GroupDocument,
  GroupLeaderboardDocument,
  GroupProfileDocument,
  HideSubmissionDocument,
  InvitePreviewDocument,
  JoinGroupDocument,
  LikePostCommentDocument,
  LikePostDocument,
  LikeSubmissionDocument,
  LoginWithPasswordDocument,
  MeDocument,
  MyGroupsDocument,
  MyPhotoFeedDocument,
  PostCommentsDocument,
  PostDownloadDocument,
  PostSort,
  RegenerateInviteLinkDocument,
  RegisterWithPasswordDocument,
  ReportSubmissionDocument,
  RequestGroupAvatarUploadDocument,
  RequestPostUploadDocument,
  RequestUploadDocument,
  SubmissionsDocument,
  SubmissionSort,
  UnlikePostCommentDocument,
  UnlikePostDocument,
  UnlikeSubmissionDocument,
  UpdateGroupProfileDocument,
  UpdatePostDocument,
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

async function submit(cookie: string, contestId: string, caption: string) {
  const bytes = new Uint8Array(await createTestImage());
  const { requestUploadUrl: ticket } = await ok(RequestUploadDocument, cookie, {
    contestId,
    contentType: 'image/png',
    byteSize: bytes.length,
  });
  const form = new FormData();
  for (const field of ticket.fields) form.append(field.name, field.value);
  form.append('file', new Blob([bytes], { type: 'image/png' }), 'photo.png');
  expect(
    (
      await fetch(ticket.url, {
        method: 'POST',
        headers: { Origin: origin },
        body: form,
      })
    ).status,
  ).toBe(204);
  expect(
    (await ok(CompleteSubmissionUploadDocument, cookie, { uploadId: ticket.id })).completeSubmissionUpload,
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

  it('그룹 사진 presigned POST와 프로필 JSON 문서로 저장·조회·삭제해야 한다', async () => {
    const { createGroup: group } = await ok(CreateGroupDocument, owner, {
      name: '프로필 문서 그룹',
      description: '처음 소개',
    });
    const image = await createTestImage();
    const { requestGroupAvatarUpload: ticket } = await ok(RequestGroupAvatarUploadDocument, owner, {
      groupId: group.id,
      contentType: 'image/png',
      byteSize: image.length,
    });
    const form = new FormData();
    for (const field of ticket.fields) form.append(field.name, field.value);
    form.append('file', new Blob([new Uint8Array(image)], { type: 'image/png' }), 'group.png');
    const response = await fetch(ticket.url, { method: 'POST', headers: { Origin: origin }, body: form });
    expect(response.status).toBe(204);
    const {
      completeGroupAvatarUpload: { id: avatarId },
    } = await ok(CompleteGroupAvatarUploadDocument, owner, { uploadId: ticket.id });
    expect(avatarId).toBeTruthy();
    const { updateGroupProfile: profile } = await ok(UpdateGroupProfileDocument, owner, {
      groupId: group.id,
      name: '바꾼 이름',
      description: '바꾼 소개',
      avatarId,
    });
    expect(profile).toMatchObject({
      name: '바꾼 이름',
      description: '바꾼 소개',
      avatarUrl: expect.stringContaining(`/groups/${group.id}/avatar/`),
    });
    expect((await ok(GroupProfileDocument, undefined, { id: group.id })).group).toMatchObject({
      name: profile.name,
      description: profile.description,
      avatarUrl: profile.avatarUrl,
      role: null,
    });
    const removed = await ok(UpdateGroupProfileDocument, owner, {
      groupId: group.id,
      name: profile.name,
      description: profile.description,
      removeAvatar: true,
    });
    expect(removed.updateGroupProfile.avatarUrl).toBeNull();
  });

  it('그룹 대회 문서는 좋아요 한도 기본값 1과 지정값을 보존해야 한다', async () => {
    const now = Date.now();
    const schedule = {
      groupId,
      title: '문서 좋아요 한도',
      startsAt: new Date(now).toISOString(),
      submissionEndsAt: new Date(now + 3_600_000).toISOString(),
      endsAt: new Date(now + 7_200_000).toISOString(),
    };
    expect((await ok(CreateGroupContestDocument, owner, schedule)).createGroupContest.likeLimit).toBe(1);
    expect(
      (await ok(CreateGroupContestDocument, owner, { ...schedule, likeLimit: 3 })).createGroupContest
        .likeLimit,
    ).toBe(3);
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
      const contentType = video ? 'video/mp4' : 'image/png';
      const bytes = video ? await createTestVideo() : await createTestImage();
      const ticket = (
        await ok(RequestPostUploadDocument, member, {
          groupId,
          contentType,
          byteSize: bytes.length,
        })
      ).requestPostUpload;
      const form = new FormData();
      for (const field of ticket.fields) form.append(field.name, field.value);
      form.append('file', new Blob([new Uint8Array(bytes)], { type: contentType }), 'media');
      const uploaded = await fetch(ticket.url, { method: 'POST', headers: { Origin: origin }, body: form });
      expect(uploaded.status).toBe(204);
      const completed = await ok(CompletePostUploadDocument, member, { uploadId: ticket.id });
      expect(completed.completePostUpload).toMatchObject({
        id: ticket.id,
        kind: video ? 'VIDEO' : 'PHOTO',
        contentType,
        byteSize: bytes.length,
      });
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
      const { postDownload } = await ok(PostDownloadDocument, member, { postId: post.id });
      expect(new URL(postDownload.url).searchParams.get('X-Amz-Expires')).toBe('60');
      expect(Date.parse(postDownload.expiresAt ?? '') - Date.now()).toBeGreaterThan(55_000);
      expect(postDownload.filename).toMatch(video ? /\.mp4$/ : /\.png$/);
      const saved = await fetch(postDownload.url);
      expect(saved.headers.get('content-disposition')).toContain('attachment;');
      expect((await saved.arrayBuffer()).byteLength).toBe(bytes.length);
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
    ).toMatchObject({ canModerate: false, canInteract: false, canDelete: false, likedByMe: false });
    expect(
      (await execute(LikePostDocument, outsider, { postId: photo.id })).errors?.[0]?.extensions?.code,
    ).toBe('FORBIDDEN');
    expect(
      (
        await ok(UpdatePostDocument, member, {
          postId: photo.id,
          title: '문서로 수정한 사진',
          body: '수정한 내용',
          categoryId: null,
        })
      ).updatePost,
    ).toMatchObject({
      id: photo.id,
      title: '문서로 수정한 사진',
      body: '수정한 내용',
      mediaUrl: photo.mediaUrl,
    });
    expect(
      (await execute(UpdatePostDocument, outsider, { postId: photo.id, title: '권한 없는 수정' })).errors?.[0]
        ?.extensions?.code,
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
      { ...comment, canDelete: false, canInteract: false },
    ]);
    expect(
      (await execute(CreatePostCommentDocument, outsider, { postId: photo.id, body: '가입 전 댓글' }))
        .errors?.[0]?.extensions?.code,
    ).toBe('FORBIDDEN');
    expect(
      (await execute(DeletePostCommentDocument, outsider, { commentId: comment.id })).errors?.[0]?.extensions
        ?.code,
    ).toBe('FORBIDDEN');
    expect(comment).toMatchObject({ likeCount: 0, likedByMe: false, canInteract: true });
    expect(
      (await execute(LikePostCommentDocument, outsider, { commentId: comment.id })).errors?.[0]?.extensions
        ?.code,
    ).toBe('FORBIDDEN');
    expect(
      (await execute(UnlikePostCommentDocument, undefined, { commentId: comment.id })).errors?.[0]?.extensions
        ?.code,
    ).toBe('UNAUTHENTICATED');
    for (let attempt = 0; attempt < 2; attempt++)
      expect(
        (await ok(LikePostCommentDocument, owner, { commentId: comment.id })).likePostComment,
      ).toMatchObject({
        id: comment.id,
        likeCount: 1,
        likedByMe: true,
      });
    expect((await ok(PostCommentsDocument, owner, commentVariables)).postComments[0]).toMatchObject({
      likeCount: 1,
      likedByMe: true,
    });
    expect((await ok(PostCommentsDocument, member, commentVariables)).postComments[0]).toMatchObject({
      likeCount: 1,
      likedByMe: false,
    });
    expect((await ok(PostCommentsDocument, undefined, commentVariables)).postComments[0]).toMatchObject({
      likeCount: 1,
      likedByMe: false,
      canInteract: false,
    });
    for (let attempt = 0; attempt < 2; attempt++)
      expect(
        (await ok(UnlikePostCommentDocument, owner, { commentId: comment.id })).unlikePostComment,
      ).toMatchObject({
        id: comment.id,
        likeCount: 0,
        likedByMe: false,
      });
    const reply = (
      await ok(CreatePostCommentDocument, owner, {
        postId: photo.id,
        parentId: comment.id,
        body: '문서로 남긴 답글',
      })
    ).createPostComment;
    expect(reply).toMatchObject({ parentId: comment.id, replyCount: 0, canInteract: true });
    expect(await ok(PostCommentsDocument, owner, commentVariables)).toMatchObject({
      postCommentCount: 1,
      postComments: [{ id: comment.id, replyCount: 1 }],
    });
    const replyVariables = { ...commentVariables, parentId: comment.id };
    expect((await ok(PostCommentsDocument, owner, replyVariables)).postComments).toEqual([reply]);
    await ok(LikePostCommentDocument, member, { commentId: reply.id });
    expect((await ok(PostCommentsDocument, undefined, replyVariables)).postComments[0]).toMatchObject({
      id: reply.id,
      likeCount: 1,
      likedByMe: false,
      canInteract: false,
    });
    expect((await ok(DeletePostCommentDocument, owner, { commentId: comment.id })).deletePostComment).toBe(
      true,
    );
    expect((await ok(PostCommentsDocument, member, commentVariables)).postComments).toEqual([]);
    expect(await ok(PostCommentsDocument, owner, replyVariables)).toMatchObject({
      postCommentCount: 0,
      postComments: [],
    });
    await ok(DeletePostDocument, owner, { postId: photo.id });
    expect(
      (await ok(GalleryPostsDocument, member, variables)).galleryPosts.some((p) => p.id === photo.id),
    ).toBe(false);
  });
  it('링크 게시물 문서는 파일 없이 실행되고 비공개 링크는 멤버에게만 보여야 한다', async () => {
    const { createGroup: group } = await ok(CreateGroupDocument, owner, {
      name: '링크 문서 비공개',
      visibility: 'PRIVATE',
    });
    const { createPost } = await ok(CreatePostDocument, owner, {
      groupId: group.id,
      title: '링크 사양',
      linkUrl: 'https://youtu.be/abcdefghijk',
      rightsConfirmed: true,
    });
    expect(createPost).toMatchObject({
      kind: 'LINK',
      mediaUrl: null,
      linkUrl: 'https://youtu.be/abcdefghijk',
    });
    expect(
      (
        await ok(GalleryPostsDocument, owner, {
          groupId: group.id,
          sort: PostSort.Newest,
          offset: 0,
          limit: 24,
        })
      ).galleryPosts[0],
    ).toMatchObject({ id: createPost.id });
    expect(
      (
        await execute(GalleryPostsDocument, outsider, {
          groupId: group.id,
          sort: PostSort.Newest,
          offset: 0,
          limit: 24,
        })
      ).errors?.[0]?.extensions?.code,
    ).toBe('FORBIDDEN');
    expect(
      (await execute(PostDownloadDocument, owner, { postId: createPost.id })).errors?.[0]?.extensions?.code,
    ).toBe('NOT_FOUND');
    await ok(DeletePostDocument, owner, { postId: createPost.id });
  });
});
