import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { createTestApp, type ITestApi, type ITestUser } from '../../test/support/app';

const POSTS =
  'query($offset:Int,$limit:Int){publicGalleryPosts(sort:NEWEST,offset:$offset,limit:$limit){id groupId canInteract}}';
interface IPublicPost {
  id: string;
  groupId: string;
  canInteract: boolean;
}

describe('공개 그룹 전체 게시물', () => {
  let api: ITestApi;
  let owner: ITestUser;
  let outsider: ITestUser;
  let publicId: string;
  const visibleIds: string[] = [];

  beforeAll(async () => {
    api = await createTestApp();
    owner = await api.signIn('공개홈-그룹장');
    outsider = await api.signIn('공개홈-신규');
    for (const visibility of ['PUBLIC', 'PRIVATE']) {
      const { createGroup: group } = await api.gqlOk<{ createGroup: { id: string } }>(
        owner.cookie,
        'mutation($visibility:GroupVisibility!){createGroup(name:"공개홈 그룹",visibility:$visibility){id}}',
        { visibility },
      );
      if (visibility === 'PUBLIC') publicId = group.id;
      for (let index = 0; index < 6; index += 1) {
        const { createPost: post } = await api.gqlOk<{ createPost: { id: string } }>(
          owner.cookie,
          'mutation($groupId:ID!){createPost(groupId:$groupId,title:"공개홈 사진",linkUrl:"https://example.com/photo",rightsConfirmed:true){id}}',
          { groupId: group.id },
        );
        await api.db.post.update({
          where: { id: post.id },
          data: { createdAt: new Date(`2100-01-0${index + 1}T00:00:00Z`), hidden: index === 5 },
        });
        if (visibility === 'PUBLIC' && index < 5) visibleIds.unshift(post.id);
      }
    }
  });
  afterAll(async () => {
    await api?.close();
  });

  it('익명에게 공개 그룹의 숨기지 않은 글만 최신순으로 보여 줘야 한다', async () => {
    const { publicGalleryPosts: posts } = await api.gqlOk<{ publicGalleryPosts: IPublicPost[] }>(
      undefined,
      POSTS,
      { limit: 5 },
    );
    expect(posts.map(({ id }) => id)).toEqual(visibleIds);
    expect(posts.every((post) => post.groupId === publicId && !post.canInteract)).toBe(true);
  });
  it('가입하지 않은 로그인 사용자에게 상호작용 권한을 주지 않아야 한다', async () => {
    const { publicGalleryPosts: posts } = await api.gqlOk<{ publicGalleryPosts: IPublicPost[] }>(
      outsider.cookie,
      POSTS,
      { limit: 5 },
    );
    expect(posts.map(({ id }) => id)).toEqual(visibleIds);
    expect(posts.every((post) => !post.canInteract)).toBe(true);
  });
  it('그룹 멤버의 상호작용 권한은 유지해야 한다', async () => {
    const { publicGalleryPosts: posts } = await api.gqlOk<{ publicGalleryPosts: IPublicPost[] }>(
      owner.cookie,
      POSTS,
      { limit: 5 },
    );
    expect(posts.every((post) => post.canInteract)).toBe(true);
  });
  it('offset 페이지를 중복 없이 이어 줘야 한다', async () => {
    const { publicGalleryPosts: posts } = await api.gqlOk<{ publicGalleryPosts: IPublicPost[] }>(
      undefined,
      POSTS,
      { offset: 2, limit: 2 },
    );
    expect(posts.map(({ id }) => id)).toEqual(visibleIds.slice(2, 4));
  });
  it.each([{ offset: -1 }, { limit: 0 }, { limit: 49 }])(
    '잘못된 페이지 범위 %j를 거부해야 한다',
    async (variables) => {
      expect(await api.gqlFail(undefined, POSTS, variables)).toMatchObject({ code: 'BAD_USER_INPUT' });
    },
  );
  it('기존 내 그룹 피드는 가입 그룹이 없으면 빈 배열을 반환해야 한다', async () => {
    expect(await api.gqlOk(outsider.cookie, '{galleryPosts{id}}')).toEqual({ galleryPosts: [] });
  });
});
