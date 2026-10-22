import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { createTestApp, type ITestApi, type ITestUser } from '../../test/support/app';
import { createGroup, joinGroup } from '../../test/support/fixtures';
import { postUpload } from '../../test/support/group-contest';
import { koreanMonth } from './post-order';

const FIELDS = 'id groupId title body kind mediaUrl likeCount commentCount likedByMe canDelete author { id }';
const COMMENT_FIELDS = 'id postId body createdAt canDelete author { id nickname avatar }';
const COMMENTS = `query($id:ID!,$offset:Int,$limit:Int){postComments(postId:$id,offset:$offset,limit:$limit){${COMMENT_FIELDS}}}`;
const CREATE_COMMENT = `mutation($id:ID!,$body:String!){createPostComment(postId:$id,body:$body){${COMMENT_FIELDS}}}`;
const DELETE_COMMENT = 'mutation($id:ID!){deletePostComment(commentId:$id)}';
interface IComment {
  id: string;
  postId: string;
  body: string;
  canDelete: boolean;
  author: { id: string; nickname: string; avatar: string | null };
}
const LIST = `query($groupId:ID,$sort:PostSort,$offset:Int,$limit:Int){galleryPosts(groupId:$groupId,sort:$sort,offset:$offset,limit:$limit){${FIELDS}}}`;
interface IPost {
  id: string;
  groupId: string;
  title: string;
  kind: string;
  mediaUrl: string;
  likeCount: number;
  commentCount: number;
  likedByMe: boolean;
  canDelete: boolean;
}
describe('상시 그룹 게시물', () => {
  let api: ITestApi,
    owner: ITestUser,
    member: ITestUser,
    outsider: ITestUser,
    groupId: string,
    otherId: string;
  const list = async (user: ITestUser, variables: Record<string, unknown> = {}) =>
    (await api.gqlOk<{ galleryPosts: IPost[] }>(user.cookie, LIST, variables)).galleryPosts;
  const create = async (user: ITestUser, title: string, video = false) => {
    const uploadId = await postUpload(api, user, groupId, video);
    return (
      await api.gqlOk<{ createPost: IPost }>(
        user.cookie,
        `mutation($group:ID!,$upload:ID!,$title:String!){createPost(groupId:$group,uploadId:$upload,title:$title,body:"본문",rightsConfirmed:true){${FIELDS}}}`,
        { group: groupId, upload: uploadId, title },
      )
    ).createPost;
  };
  beforeAll(async () => {
    api = await createTestApp();
    owner = await api.signIn('그룹 관리자');
    member = await api.signIn('그룹 회원');
    outsider = await api.signIn('그룹 외부인');
    groupId = (await createGroup(api, owner, '상시 그룹', [member], 'PRIVATE')).id;
    otherId = (await createGroup(api, outsider, '외부 그룹')).id;
  });
  afterAll(async () => {
    await api?.close();
  });
  it('대회와 날짜 없이 같은 회원이 여러 사진·동영상을 올릴 수 있어야 한다', async () => {
    const a = await create(member, '첫 사진');
    const b = await create(member, '두 번째 사진');
    const v = await create(member, '움직이는 순간', true);
    expect(v.kind).toBe('VIDEO');
    expect((await list(owner, { groupId })).map((p) => p.id)).toEqual([v.id, b.id, a.id]);
    expect(await api.db.contest.count({ where: { groupId } })).toBe(0);
    expect((await list(owner, { groupId, offset: 1, limit: 1 }))[0]?.id).toBe(b.id);
  });
  it('파일은 매번 멤버십을 검사하고 구간 요청으로 재생·탐색해야 한다', async () => {
    const v = await create(member, '구간 재생', true);
    const path = v.mediaUrl.replace('/backend', '');
    expect((await api.http().get(path)).status).toBe(401);
    expect((await api.http().get(path).set('Cookie', outsider.cookie)).status).toBe(403);
    const res = await api.http().get(path).set('Cookie', owner.cookie).set('Range', 'bytes=0-15');
    expect(res.status).toBe(206);
    expect(res.headers['content-type']).toContain('video/mp4');
    expect(res.headers['content-length']).toBe('16');
    expect(res.headers['cache-control']).toContain('no-store');
    expect(
      (await api.http().get(path).set('Cookie', owner.cookie).set('Range', 'bytes=999999-')).status,
    ).toBe(416);
  });
  it('외부인의 그룹 조회와 다른 그룹에 속한 첨부의 게시를 거부해야 한다', async () => {
    expect((await api.gqlFail(outsider.cookie, LIST, { groupId })).code).toBe('FORBIDDEN');
    const uploadId = await postUpload(api, member, groupId);
    expect(
      (
        await api.gqlFail(
          member.cookie,
          'mutation($g:ID!,$u:ID!){createPost(groupId:$g,uploadId:$u,title:"조작",rightsConfirmed:true){id}}',
          { g: otherId, u: uploadId },
        )
      ).code,
    ).toBe('FORBIDDEN');
  });
  it('이달 게시물만 좋아요·최신순으로 정렬하고 동시 좋아요를 중복 집계하지 않아야 한다', async () => {
    const old = await create(member, '지난 달 인기');
    const hot = await create(member, '이달 인기');
    const recent = await create(member, '이달 최신');
    await api.db.post.update({
      where: { id: old.id },
      data: { createdAt: new Date(koreanMonth().gte.getTime() - 1) },
    });
    const like = 'mutation($id:ID!){likePost(postId:$id){id likeCount likedByMe}}';
    await api.gqlOk(owner.cookie, like, { id: old.id });
    await Promise.all(Array.from({ length: 4 }, () => api.gqlOk(owner.cookie, like, { id: hot.id })));
    const rows = await list(owner, { groupId, sort: 'MONTHLY_POPULAR' });
    expect(rows[0]).toMatchObject({ id: hot.id, likeCount: 1, likedByMe: true });
    expect(rows.some((p) => p.id === old.id)).toBe(false);
    expect(rows[1]?.id).toBe(recent.id);
  });
  it('작성자와 관리자만 게시물·좋아요·파일을 삭제할 수 있어야 한다', async () => {
    const post = await create(member, '관리자 삭제');
    const del = 'mutation($id:ID!){deletePost(postId:$id)}';
    const peer = await api.signIn('다른 회원');
    const group = await api.db.group.findUniqueOrThrow({ where: { id: groupId } });
    await joinGroup(api, peer, group.inviteToken, owner);
    expect((await list(owner, { groupId })).find((p) => p.id === post.id)?.canDelete).toBe(true);
    expect((await api.gqlFail(peer.cookie, del, { id: post.id })).code).toBe('FORBIDDEN');
    const { upload } = await api.db.post.findUniqueOrThrow({
      where: { id: post.id },
      include: { upload: true },
    });
    const key = upload?.storageKey ?? '';
    expect(await api.storage.head(key)).toMatchObject({ contentType: 'image/png' });
    await api.gqlOk(owner.cookie, del, { id: post.id });
    expect((await list(member, { groupId })).some((p) => p.id === post.id)).toBe(false);
    await expect(api.storage.head(key)).rejects.toThrow();
    expect(
      (await api.http().get(post.mediaUrl.replace('/backend', '')).set('Cookie', owner.cookie)).status,
    ).toBe(404);
    await api.gqlOk(member.cookie, del, { id: (await create(member, '직접 삭제')).id });
  });

  it('댓글을 작성·조회하고 실제 개수를 집계하며 작성자와 관리자만 삭제해야 한다', async () => {
    const post = await create(owner, '댓글 권한');
    const { createPostComment: comment } = await api.gqlOk<{ createPostComment: IComment }>(
      member.cookie,
      CREATE_COMMENT,
      { id: post.id, body: '  웃긴 순간\n같이 웃어요  ' },
    );
    expect(comment).toMatchObject({
      postId: post.id,
      body: '웃긴 순간\n같이 웃어요',
      canDelete: true,
      author: { id: member.id },
    });
    expect((await list(owner, { groupId })).find(({ id }) => id === post.id)?.commentCount).toBe(1);
    const peer = await api.signIn('댓글 다른 회원');
    const group = await api.db.group.findUniqueOrThrow({ where: { id: groupId } });
    await joinGroup(api, peer, group.inviteToken, owner);
    expect(
      (await api.gqlOk<{ postComments: IComment[] }>(peer.cookie, COMMENTS, { id: post.id })).postComments[0]
        ?.canDelete,
    ).toBe(false);
    expect((await api.gqlFail(peer.cookie, DELETE_COMMENT, { id: comment.id })).code).toBe('FORBIDDEN');
    await api.gqlOk(member.cookie, DELETE_COMMENT, { id: comment.id });
    const next = await api.gqlOk<{ createPostComment: IComment }>(member.cookie, CREATE_COMMENT, {
      id: post.id,
      body: '관리자 삭제 확인',
    });
    await api.gqlOk(owner.cookie, DELETE_COMMENT, { id: next.createPostComment.id });
    expect((await list(owner, { groupId })).find(({ id }) => id === post.id)?.commentCount).toBe(0);
    expect((await api.gqlFail(member.cookie, DELETE_COMMENT, { id: comment.id })).code).toBe('NOT_FOUND');
  });

  it('비로그인·외부인은 댓글을 읽거나 쓰거나 삭제할 수 없어야 한다', async () => {
    const post = await create(member, '댓글 접근 제한');
    const { createPostComment: comment } = await api.gqlOk<{ createPostComment: IComment }>(
      member.cookie,
      CREATE_COMMENT,
      { id: post.id, body: '멤버끼리만' },
    );
    for (const cookie of [undefined, outsider.cookie]) {
      const code = cookie ? 'FORBIDDEN' : 'UNAUTHENTICATED';
      expect((await api.gqlFail(cookie, COMMENTS, { id: post.id })).code).toBe(code);
      expect((await api.gqlFail(cookie, CREATE_COMMENT, { id: post.id, body: '침입' })).code).toBe(code);
      expect((await api.gqlFail(cookie, DELETE_COMMENT, { id: comment.id })).code).toBe(code);
    }
  });

  it('공백·너무 긴 댓글과 잘못된 페이지 인자를 거부해야 한다', async () => {
    const post = await create(member, '댓글 검증');
    for (const body of ['', '  \n ', '가'.repeat(1001)])
      expect((await api.gqlFail(member.cookie, CREATE_COMMENT, { id: post.id, body })).code).toBe(
        'BAD_USER_INPUT',
      );
    for (const variables of [{ offset: -1 }, { limit: 0 }, { limit: 49 }])
      expect((await api.gqlFail(member.cookie, COMMENTS, { id: post.id, ...variables })).code).toBe(
        'BAD_USER_INPUT',
      );
    expect((await api.gqlFail(member.cookie, COMMENTS, { id: 'missing' })).code).toBe('NOT_FOUND');
    expect((await api.gqlFail(member.cookie, CREATE_COMMENT, { id: 'missing', body: '없는 글' })).code).toBe(
      'NOT_FOUND',
    );
  });

  it('댓글은 같은 작성 시각에도 ID까지 최신순으로 정렬하고 페이지를 나눠야 한다', async () => {
    const post = await create(member, '댓글 페이지');
    const ids: string[] = [];
    for (const body of ['하나', '둘', '셋'])
      ids.push(
        (
          await api.gqlOk<{ createPostComment: IComment }>(member.cookie, CREATE_COMMENT, {
            id: post.id,
            body,
          })
        ).createPostComment.id,
      );
    await api.db.postComment.updateMany({
      where: { postId: post.id },
      data: { createdAt: new Date('2026-10-17T00:00:00Z') },
    });
    const page = await api.gqlOk<{ postComments: IComment[] }>(member.cookie, COMMENTS, {
      id: post.id,
      limit: 2,
    });
    const tail = await api.gqlOk<{ postComments: IComment[] }>(member.cookie, COMMENTS, {
      id: post.id,
      offset: 2,
      limit: 2,
    });
    expect([...page.postComments, ...tail.postComments].map(({ id }) => id)).toEqual(ids.sort().reverse());
  });

  it('숨긴 글의 댓글도 멤버에게 노출하지 않고 게시물 삭제 시 댓글을 함께 지워야 한다', async () => {
    const post = await create(member, '숨긴 댓글');
    const { createPostComment: comment } = await api.gqlOk<{ createPostComment: IComment }>(
      member.cookie,
      CREATE_COMMENT,
      { id: post.id, body: '숨겨질 댓글' },
    );
    await api.db.post.update({ where: { id: post.id }, data: { hidden: true } });
    expect((await api.gqlFail(member.cookie, COMMENTS, { id: post.id })).code).toBe('NOT_FOUND');
    expect((await api.gqlFail(member.cookie, CREATE_COMMENT, { id: post.id, body: '금지' })).code).toBe(
      'NOT_FOUND',
    );
    expect((await api.gqlFail(member.cookie, DELETE_COMMENT, { id: comment.id })).code).toBe('NOT_FOUND');
    expect(
      (await api.gqlOk<{ postComments: IComment[] }>(owner.cookie, COMMENTS, { id: post.id })).postComments,
    ).toHaveLength(1);
    await api.gqlOk(owner.cookie, 'mutation($id:ID!){deletePost(postId:$id)}', { id: post.id });
    expect(await api.db.postComment.count({ where: { postId: post.id } })).toBe(0);
    const event = await api.db.analyticsEvent.findUniqueOrThrow({
      where: { id: `comment-created:${comment.id}` },
    });
    expect(event.properties).toEqual({ postId: post.id, commentId: comment.id });
  });
});
