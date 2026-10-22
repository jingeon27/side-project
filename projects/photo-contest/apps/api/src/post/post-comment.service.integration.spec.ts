import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { createTestApp, type ITestApi, type ITestUser } from '../../test/support/app';
import { createGroup } from '../../test/support/fixtures';

const FIELDS = 'id postId body likeCount likedByMe canInteract canDelete';
const CREATE = `mutation($postId:ID!){createPostComment(postId:$postId,body:"같이 웃어요"){${FIELDS}}}`;
const LIST = `query($postId:ID!,$offset:Int,$limit:Int){postComments(postId:$postId,offset:$offset,limit:$limit){${FIELDS}}}`;
const LIKE = `mutation($id:ID!){likePostComment(commentId:$id){${FIELDS}}}`;
const UNLIKE = `mutation($id:ID!){unlikePostComment(commentId:$id){${FIELDS}}}`;
const DELETE = 'mutation($id:ID!){deletePostComment(commentId:$id)}';

interface IComment {
  id: string;
  postId: string;
  likeCount: number;
  likedByMe: boolean;
  canInteract: boolean;
  canDelete: boolean;
}

describe('댓글 좋아요', () => {
  let api: ITestApi, owner: ITestUser, member: ITestUser, outsider: ITestUser;
  let publicGroupId: string, privateGroupId: string;

  const create = async (groupId = publicGroupId) => {
    const { createPost: post } = await api.gqlOk<{ createPost: { id: string } }>(
      owner.cookie,
      'mutation($groupId:ID!){createPost(groupId:$groupId,title:"댓글 반응",linkUrl:"https://example.com",rightsConfirmed:true){id}}',
      { groupId },
    );
    return (await api.gqlOk<{ createPostComment: IComment }>(member.cookie, CREATE, { postId: post.id }))
      .createPostComment;
  };
  const list = async (cookie: string | undefined, postId: string, offset = 0, limit = 24) =>
    (await api.gqlOk<{ postComments: IComment[] }>(cookie, LIST, { postId, offset, limit })).postComments;

  beforeAll(async () => {
    api = await createTestApp();
    owner = await api.signIn('댓글 좋아요 관리자');
    member = await api.signIn('댓글 좋아요 회원');
    outsider = await api.signIn('댓글 좋아요 비회원');
    publicGroupId = (await createGroup(api, owner, '댓글 좋아요 공개', [member])).id;
    privateGroupId = (await createGroup(api, owner, '댓글 좋아요 비공개', [member], 'PRIVATE')).id;
  });
  afterAll(async () => api?.close());

  it('같은 회원의 동시 좋아요·취소는 멱등이며 DB와 응답의 개수가 일치해야 한다', async () => {
    const comment = await create();
    expect(comment).toMatchObject({ likeCount: 0, likedByMe: false, canInteract: true });
    const liked = await Promise.all(
      Array.from({ length: 8 }, () =>
        api.gqlOk<{ likePostComment: IComment }>(owner.cookie, LIKE, { id: comment.id }),
      ),
    );
    expect(liked.map(({ likePostComment }) => likePostComment.likeCount)).toEqual(Array(8).fill(1));
    expect(liked.every(({ likePostComment }) => likePostComment.likedByMe)).toBe(true);
    expect(await api.db.postCommentLike.count({ where: { commentId: comment.id } })).toBe(1);
    expect(await list(owner.cookie, comment.postId)).toMatchObject([{ likeCount: 1, likedByMe: true }]);
    expect(await list(member.cookie, comment.postId)).toMatchObject([{ likeCount: 1, likedByMe: false }]);
    const event = await api.db.analyticsEvent.findUniqueOrThrow({
      where: { id: `comment-like:${comment.id}:${owner.id}` },
    });
    expect(event).toMatchObject({
      type: 'comment_liked',
      properties: { commentId: comment.id, postId: comment.postId },
    });
    const unliked = await Promise.all(
      Array.from({ length: 8 }, () =>
        api.gqlOk<{ unlikePostComment: IComment }>(owner.cookie, UNLIKE, { id: comment.id }),
      ),
    );
    expect(
      unliked.every(
        ({ unlikePostComment }) => unlikePostComment.likeCount === 0 && !unlikePostComment.likedByMe,
      ),
    ).toBe(true);
    expect(await api.db.postCommentLike.count({ where: { commentId: comment.id } })).toBe(0);
  });

  it('여러 회원의 반응과 본인 댓글 좋아요를 따로 저장하고 취소는 내 반응만 지워야 한다', async () => {
    const comment = await create();
    await Promise.all([owner, member].map((user) => api.gqlOk(user.cookie, LIKE, { id: comment.id })));
    expect(await list(member.cookie, comment.postId)).toMatchObject([{ likeCount: 2, likedByMe: true }]);
    await api.gqlOk(owner.cookie, UNLIKE, { id: comment.id });
    expect(await list(owner.cookie, comment.postId)).toMatchObject([{ likeCount: 1, likedByMe: false }]);
    expect(await list(member.cookie, comment.postId)).toMatchObject([{ likeCount: 1, likedByMe: true }]);
  });

  it('공개 댓글 개수는 익명에게 보이고 가입 전에는 좋아요·취소를 거부해야 한다', async () => {
    const comment = await create();
    await api.gqlOk(member.cookie, LIKE, { id: comment.id });
    for (const cookie of [undefined, outsider.cookie]) {
      expect(await list(cookie, comment.postId)).toMatchObject([
        { likeCount: 1, likedByMe: false, canInteract: false, canDelete: false },
      ]);
      for (const mutation of [LIKE, UNLIKE])
        expect((await api.gqlFail(cookie, mutation, { id: comment.id })).code).toBe(
          cookie ? 'FORBIDDEN' : 'UNAUTHENTICATED',
        );
    }
    expect(await api.db.postCommentLike.count({ where: { commentId: comment.id } })).toBe(1);
  });

  it('비공개·승인 대기·숨긴 게시물의 댓글 반응에 기존 접근 권한을 적용해야 한다', async () => {
    const comment = await create(privateGroupId);
    await api.gqlOk(outsider.cookie, 'mutation($id:ID!){requestGroupMembership(groupId:$id){id}}', {
      id: privateGroupId,
    });
    // 비공개 그룹의 게시물은 비멤버에게 있는지도 알리지 않는다(로그인 필요한 쓰기는 먼저 UNAUTHENTICATED).
    for (const cookie of [undefined, outsider.cookie]) {
      expect((await api.gqlFail(cookie, LIST, { postId: comment.postId })).code).toBe('NOT_FOUND');
      for (const mutation of [LIKE, UNLIKE])
        expect((await api.gqlFail(cookie, mutation, { id: comment.id })).code).toBe(
          cookie ? 'NOT_FOUND' : 'UNAUTHENTICATED',
        );
    }
    await api.gqlOk(owner.cookie, 'mutation($id:ID!){setPostHidden(postId:$id,hidden:true)}', {
      id: comment.postId,
    });
    for (const mutation of [LIKE, UNLIKE])
      expect((await api.gqlFail(member.cookie, mutation, { id: comment.id })).code).toBe('NOT_FOUND');
    await api.gqlOk(owner.cookie, LIKE, { id: comment.id });
    expect(await list(owner.cookie, comment.postId)).toMatchObject([{ likeCount: 1, likedByMe: true }]);
  });

  it('페이지를 넘겨도 댓글마다 좋아요 수와 내 반응이 유지되어야 한다', async () => {
    const first = await create();
    const second = (
      await api.gqlOk<{ createPostComment: IComment }>(member.cookie, CREATE, { postId: first.postId })
    ).createPostComment;
    await api.gqlOk(owner.cookie, LIKE, { id: first.id });
    await api.gqlOk(member.cookie, LIKE, { id: second.id });
    expect(await list(owner.cookie, first.postId, 0, 1)).toMatchObject([
      { id: second.id, likeCount: 1, likedByMe: false },
    ]);
    expect(await list(owner.cookie, first.postId, 1, 1)).toMatchObject([
      { id: first.id, likeCount: 1, likedByMe: true },
    ]);
  });

  it('댓글·게시물·사용자를 지우면 연결된 좋아요도 지우고 없는 댓글 요청은 거부해야 한다', async () => {
    const comment = await create();
    await api.gqlOk(owner.cookie, LIKE, { id: comment.id });
    await api.gqlOk(member.cookie, DELETE, { id: comment.id });
    expect(await api.db.postCommentLike.count({ where: { commentId: comment.id } })).toBe(0);
    for (const mutation of [LIKE, UNLIKE])
      expect((await api.gqlFail(owner.cookie, mutation, { id: comment.id })).code).toBe('NOT_FOUND');
    const postComment = await create();
    await api.gqlOk(member.cookie, LIKE, { id: postComment.id });
    await api.gqlOk(owner.cookie, 'mutation($id:ID!){deletePost(postId:$id)}', { id: postComment.postId });
    expect(await api.db.postCommentLike.count({ where: { commentId: postComment.id } })).toBe(0);
    const userComment = await create();
    const temporary = await api.signIn('댓글 좋아요 탈퇴 회원');
    await api.db.groupMember.create({ data: { groupId: publicGroupId, userId: temporary.id } });
    await api.gqlOk(temporary.cookie, LIKE, { id: userComment.id });
    await api.db.user.delete({ where: { id: temporary.id } });
    expect(await list(owner.cookie, userComment.postId)).toMatchObject([{ likeCount: 0, likedByMe: false }]);
  });
});
