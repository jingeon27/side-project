import { expect, it } from 'vitest';

import { createTestApp } from '../../../test/support/app';
import { createGroup } from '../../../test/support/fixtures';

it('여러 회원이 같은 댓글에 동시에 좋아요를 남기고 취소해도 충돌 없이 각자의 반응을 보존해야 한다', async () => {
  const api = await createTestApp();
  try {
    const owner = await api.signIn('댓글 동시 반응 그룹장');
    const members = await Promise.all(
      Array.from({ length: 8 }, (_, index) => api.signIn(`댓글 동시 반응 회원 ${index}`)),
    );
    const group = await createGroup(api, owner, '댓글 동시 반응 그룹', members);
    const { createPost: post } = await api.gqlOk<{ createPost: { id: string } }>(
      owner.cookie,
      'mutation($groupId:ID!){createPost(groupId:$groupId,title:"동시 반응",linkUrl:"https://example.com",rightsConfirmed:true){id}}',
      { groupId: group.id },
    );
    const { createPostComment: comment } = await api.gqlOk<{ createPostComment: { id: string } }>(
      owner.cookie,
      'mutation($postId:ID!){createPostComment(postId:$postId,body:"함께 좋아요"){id}}',
      { postId: post.id },
    );
    const results = await Promise.all(
      members.map((member) =>
        api.gql<{ likePostComment: { likedByMe: boolean } }>(
          member.cookie,
          'mutation($id:ID!){likePostComment(commentId:$id){likedByMe}}',
          { id: comment.id },
        ),
      ),
    );
    for (const result of results) {
      expect(result.errors).toBeUndefined();
      expect(result.data?.likePostComment.likedByMe).toBe(true);
    }
    expect(await api.db.postCommentLike.count({ where: { commentId: comment.id } })).toBe(members.length);
    expect(
      await api.db.analyticsEvent.count({
        where: { id: { in: members.map((member) => `comment-like:${comment.id}:${member.id}`) } },
      }),
    ).toBe(members.length);

    const cancelled = await Promise.all(
      members.map((member) =>
        api.gql(member.cookie, 'mutation($id:ID!){unlikePostComment(commentId:$id){likedByMe}}', {
          id: comment.id,
        }),
      ),
    );
    for (const result of cancelled) expect(result.errors).toBeUndefined();
    expect(await api.db.postCommentLike.count({ where: { commentId: comment.id } })).toBe(0);
  } finally {
    await api.close();
  }
});
