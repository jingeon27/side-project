import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { createTestApp, type ITestApi, type ITestUser } from '../../../test/support/app';
import { createGroup } from '../../../test/support/fixtures';

const FIELDS = 'id postId parentId replyCount body likeCount likedByMe canDelete canInteract';
const CREATE = `mutation($postId:ID!,$parentId:ID,$body:String!){createPostComment(postId:$postId,parentId:$parentId,body:$body){${FIELDS}}}`;
const LIST = `query($postId:ID!,$parentId:ID,$offset:Int,$limit:Int){postCommentCount(postId:$postId,parentId:$parentId) postComments(postId:$postId,parentId:$parentId,offset:$offset,limit:$limit){${FIELDS}}}`;
interface IComment {
  id: string;
  postId: string;
  parentId: string | null;
  replyCount: number;
  body: string;
}

describe('대댓글', () => {
  let api: ITestApi, owner: ITestUser, member: ITestUser, outsider: ITestUser;
  let groupId: string;
  const create = async (postId: string, parentId?: string, user = member, body = '답글로 같이 웃어요') =>
    (await api.gqlOk<{ createPostComment: IComment }>(user.cookie, CREATE, { postId, parentId, body }))
      .createPostComment;
  const post = async (id = groupId) =>
    (
      await api.gqlOk<{ createPost: { id: string } }>(
        owner.cookie,
        'mutation($id:ID!){createPost(groupId:$id,title:"답글 테스트",linkUrl:"https://example.com",rightsConfirmed:true){id}}',
        { id },
      )
    ).createPost.id;
  const list = async (
    postId: string,
    parentId?: string,
    cookie: string | undefined = owner.cookie,
    offset = 0,
    limit = 24,
  ) =>
    api.gqlOk<{ postComments: IComment[]; postCommentCount: number }>(cookie, LIST, {
      postId,
      parentId,
      offset,
      limit,
    });
  beforeAll(async () => {
    api = await createTestApp();
    owner = await api.signIn('답글 관리자');
    member = await api.signIn('답글 회원');
    outsider = await api.signIn('답글 비회원');
    groupId = (await createGroup(api, owner, '답글 공개 그룹', [member])).id;
  });
  afterAll(async () => api?.close());

  it('원댓글과 답글을 분리하고 전체 댓글 수에는 답글도 포함해야 한다', async () => {
    const postId = await post();
    const parent = await create(postId);
    const reply = await create(postId, parent.id, owner);
    expect(reply).toMatchObject({ parentId: parent.id, replyCount: 0 });
    expect(await list(postId)).toMatchObject({
      postCommentCount: 1,
      postComments: [{ id: parent.id, parentId: null, replyCount: 1 }],
    });
    expect(await list(postId, parent.id)).toMatchObject({
      postCommentCount: 1,
      postComments: [{ id: reply.id, parentId: parent.id }],
    });
    const { galleryPost } = await api.gqlOk<{ galleryPost: { commentCount: number } }>(
      owner.cookie,
      'query($id:ID!){galleryPost(id:$id){commentCount}}',
      { id: postId },
    );
    expect(galleryPost.commentCount).toBe(2);
  });

  it('다른 게시물의 댓글과 2단계 이상의 답글을 거부하고 DB에서도 게시물 일치를 보장해야 한다', async () => {
    const first = await post(),
      second = await post();
    expect(
      (await api.gqlFail(member.cookie, CREATE, { postId: first, parentId: '', body: '빈 부모' })).code,
    ).toBe('NOT_FOUND');
    const parent = await create(first),
      reply = await create(first, parent.id);
    expect(
      (await api.gqlFail(member.cookie, CREATE, { postId: second, parentId: parent.id, body: '잘못 연결' }))
        .code,
    ).toBe('NOT_FOUND');
    expect(
      (await api.gqlFail(member.cookie, CREATE, { postId: first, parentId: reply.id, body: '너무 깊음' }))
        .code,
    ).toBe('BAD_USER_INPUT');
    await expect(
      api.db.postComment.create({
        data: { postId: second, parentId: parent.id, authorId: member.id, body: 'FK 검사' },
      }),
    ).rejects.toMatchObject({ code: 'P2003' });
  });

  it('공개 답글은 가입 전에도 보이지만 작성·좋아요는 승인된 멤버만 허용해야 한다', async () => {
    const postId = await post(),
      parent = await create(postId),
      reply = await create(postId, parent.id);
    expect(await api.gqlOk(undefined, LIST, { postId, parentId: parent.id })).toMatchObject({
      postCommentCount: 1,
      postComments: [{ id: reply.id, canInteract: false, canDelete: false }],
    });
    for (const cookie of [undefined, outsider.cookie]) {
      expect((await api.gqlFail(cookie, CREATE, { postId, parentId: parent.id, body: '가입 전' })).code).toBe(
        cookie ? 'FORBIDDEN' : 'UNAUTHENTICATED',
      );
      expect(
        (await api.gqlFail(cookie, 'mutation($id:ID!){likePostComment(commentId:$id){id}}', { id: reply.id }))
          .code,
      ).toBe(cookie ? 'FORBIDDEN' : 'UNAUTHENTICATED');
    }
    await api.gqlOk(owner.cookie, 'mutation($id:ID!){likePostComment(commentId:$id){id}}', { id: reply.id });
    expect(await list(postId, parent.id)).toMatchObject({
      postComments: [{ id: reply.id, likeCount: 1, likedByMe: true }],
    });
  });

  it('비공개·승인 대기·숨긴 게시물에는 답글 조회·개수·작성을 허용하지 않아야 한다', async () => {
    const privateGroup = await createGroup(api, owner, '답글 비공개 그룹', [member], 'PRIVATE');
    const postId = await post(privateGroup.id),
      parent = await create(postId);
    await create(postId, parent.id);
    await api.gqlOk(outsider.cookie, 'mutation($id:ID!){requestGroupMembership(groupId:$id){id}}', {
      id: privateGroup.id,
    });
    for (const cookie of [undefined, outsider.cookie])
      expect((await api.gqlFail(cookie, LIST, { postId, parentId: parent.id })).code).toBe('NOT_FOUND');
    await api.gqlOk(owner.cookie, 'mutation($id:ID!){setPostHidden(postId:$id,hidden:true)}', { id: postId });
    expect((await api.gqlFail(member.cookie, LIST, { postId, parentId: parent.id })).code).toBe('NOT_FOUND');
    expect(
      (await api.gqlFail(member.cookie, CREATE, { postId, parentId: parent.id, body: '숨긴 글' })).code,
    ).toBe('NOT_FOUND');
    expect((await list(postId, parent.id)).postCommentCount).toBe(1);
  });

  it('답글을 오래된 순으로 이어 받고 원댓글 페이지와 섞지 않아야 한다', async () => {
    const postId = await post(),
      parent = await create(postId),
      other = await create(postId);
    const ids: string[] = [];
    for (let index = 0; index < 13; index++)
      ids.push((await create(postId, parent.id, member, `답글 ${index}`)).id);
    const first = await list(postId, parent.id, owner.cookie, 0, 12),
      second = await list(postId, parent.id, owner.cookie, 12, 12);
    expect(first.postCommentCount).toBe(13);
    expect([...first.postComments, ...second.postComments].map(({ id }) => id)).toEqual(ids);
    expect((await list(postId)).postComments.map(({ id }) => id)).toEqual([other.id, parent.id]);
  });

  it('답글 작성자와 관리자만 삭제하고 원댓글 삭제 시 답글·좋아요도 함께 정리해야 한다', async () => {
    const postId = await post(),
      parent = await create(postId),
      reply = await create(postId, parent.id, owner);
    const remove = 'mutation($id:ID!){deletePostComment(commentId:$id)}';
    expect((await api.gqlFail(member.cookie, remove, { id: reply.id })).code).toBe('FORBIDDEN');
    await api.gqlOk(owner.cookie, 'mutation($id:ID!){likePostComment(commentId:$id){id}}', { id: reply.id });
    await api.gqlOk(member.cookie, remove, { id: parent.id });
    expect((await list(postId)).postCommentCount).toBe(0);
    expect(await api.db.postComment.count({ where: { postId } })).toBe(0);
    expect(await api.db.postCommentLike.count({ where: { commentId: reply.id } })).toBe(0);
    expect(
      (await api.gqlFail(member.cookie, CREATE, { postId, parentId: parent.id, body: '삭제됨' })).code,
    ).toBe('NOT_FOUND');
  });
});
