import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { createTestApp, type ITestApi, type ITestUser } from '../../test/support/app';
import { createGroup } from '../../test/support/fixtures';

const MINE =
  'query($groupId:ID,$offset:Int,$limit:Int){myGalleryPosts(groupId:$groupId,offset:$offset,limit:$limit){id groupId author{id}}}';
interface IMyPost {
  id: string;
  groupId: string;
  author: { id: string };
}

describe('내가 올린 게시물', () => {
  let api: ITestApi;
  let author: ITestUser;
  let peer: ITestUser;
  let firstGroup: string;
  let secondGroup: string;
  let privateGroup: string;
  let privatePost: string;
  let firstPost: string;

  const create = async (user: ITestUser, groupId: string) =>
    (
      await api.gqlOk<{ createPost: { id: string } }>(
        user.cookie,
        'mutation($group:ID!){createPost(groupId:$group,title:"내 게시물 확인",linkUrl:"https://example.com/photo",rightsConfirmed:true){id}}',
        { group: groupId },
      )
    ).createPost.id;

  const list = async (variables: Record<string, unknown> = {}) =>
    (await api.gqlOk<{ myGalleryPosts: IMyPost[] }>(author.cookie, MINE, variables)).myGalleryPosts;

  beforeAll(async () => {
    api = await createTestApp();
    author = await api.signIn('my-posts-author');
    peer = await api.signIn('my-posts-peer');
    firstGroup = (await createGroup(api, author, 'my-posts-first', [peer], 'PUBLIC')).id;
    secondGroup = (await createGroup(api, author, 'my-posts-second', [], 'PUBLIC')).id;
    privateGroup = (await createGroup(api, peer, 'my-posts-private', [author], 'PRIVATE')).id;
    firstPost = await create(author, firstGroup);
    await create(author, secondGroup);
    privatePost = await create(author, privateGroup);
    await create(peer, firstGroup);
  });

  afterAll(async () => {
    await api?.close();
  });

  it('로그인한 사용자 자신의 게시물만 반환하고 비회원 조회는 거부해야 한다', async () => {
    const posts = await list();
    expect(posts).toHaveLength(3);
    expect(posts.every((post) => post.author.id === author.id)).toBe(true);
    expect((await api.gqlFail(undefined, MINE)).code).toBe('UNAUTHENTICATED');
  });

  it('그룹 필터와 페이지 경계를 적용하고 숨긴 게시물을 제외해야 한다', async () => {
    expect((await list({ groupId: firstGroup })).map((post) => post.id)).toEqual([firstPost]);
    const posts = await list();
    expect(await list({ offset: 1, limit: 1 })).toEqual([posts[1]]);
    await api.gqlOk(author.cookie, 'mutation($id:ID!){setPostHidden(postId:$id,hidden:true)}', {
      id: firstPost,
    });
    expect(await list({ groupId: firstGroup })).toEqual([]);
    expect((await api.gqlFail(author.cookie, MINE, { offset: -1 })).code).toBe('BAD_USER_INPUT');
  });

  it('탈퇴한 비공개 그룹의 게시물과 해당 그룹 필터를 노출하지 않아야 한다', async () => {
    await api.gqlOk(author.cookie, 'mutation($id:ID!){leaveGroup(groupId:$id){id}}', { id: privateGroup });
    expect((await list()).map((post) => post.id)).not.toContain(privatePost);
    expect((await api.gqlFail(author.cookie, MINE, { groupId: privateGroup })).code).toBe('FORBIDDEN');
  });
});
