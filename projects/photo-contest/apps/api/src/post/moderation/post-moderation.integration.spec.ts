import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { createTestApp, type ITestApi, type ITestUser } from '../../../test/support/app';

const HIDE = 'mutation($id:ID!,$hidden:Boolean!){setPostHidden(postId:$id,hidden:$hidden)}';
const POST = 'query($id:ID!){galleryPost(id:$id){id}}';
describe('공개 게시물 숨김과 복원', () => {
  let api: ITestApi;
  let owner: ITestUser;
  let member: ITestUser;
  let outsider: ITestUser;
  let groupId: string;
  let postId: string;
  beforeAll(async () => {
    api = await createTestApp();
    owner = await api.signIn('게시물숨김-그룹장');
    member = await api.signIn('게시물숨김-멤버');
    outsider = await api.signIn('게시물숨김-외부인');
    groupId = (
      await api.gqlOk<{ createGroup: { id: string } }>(
        owner.cookie,
        'mutation{createGroup(name:"숨김 운영",visibility:PUBLIC){id}}',
      )
    ).createGroup.id;
    await api.gqlOk(member.cookie, 'mutation($id:ID!){requestGroupMembership(groupId:$id){id}}', {
      id: groupId,
    });
    postId = (
      await api.gqlOk<{ createPost: { id: string } }>(
        owner.cookie,
        'mutation($id:ID!){createPost(groupId:$id,title:"숨김 운영 글",linkUrl:"https://example.com",rightsConfirmed:true){id}}',
        { id: groupId },
      )
    ).createPost.id;
  });
  afterAll(async () => {
    await api?.close();
  });
  it('비로그인·비멤버·일반 멤버는 숨김을 변경하지 못해야 한다', async () => {
    for (const cookie of [undefined, outsider.cookie, member.cookie])
      expect((await api.gqlFail(cookie, HIDE, { id: postId, hidden: true })).code).toBe(
        cookie ? 'FORBIDDEN' : 'UNAUTHENTICATED',
      );
    expect(await api.gqlOk(undefined, POST, { id: postId })).toEqual({ galleryPost: { id: postId } });
  });
  it('그룹장이 숨기면 익명·멤버 조회와 공개 피드에서 빠져야 한다', async () => {
    await api.gqlOk(owner.cookie, HIDE, { id: postId, hidden: true });
    for (const cookie of [undefined, member.cookie])
      expect(await api.gqlFail(cookie, POST, { id: postId })).toMatchObject({ code: 'NOT_FOUND' });
    const { publicGalleryPosts } = await api.gqlOk<{ publicGalleryPosts: { id: string }[] }>(
      undefined,
      '{publicGalleryPosts(sort:NEWEST,limit:48){id}}',
    );
    expect(publicGalleryPosts.map((p) => p.id)).not.toContain(postId);
    expect(
      (
        await api.gqlOk<{ hiddenGalleryPosts: { id: string }[] }>(
          owner.cookie,
          'query($id:ID!){hiddenGalleryPosts(groupId:$id){id}}',
          { id: groupId },
        )
      ).hiddenGalleryPosts,
    ).toEqual([{ id: postId }]);
  });
  it('일반 멤버는 숨긴 목록을 읽지 못해야 한다', async () => {
    expect(
      await api.gqlFail(member.cookie, 'query($id:ID!){hiddenGalleryPosts(groupId:$id){id}}', {
        id: groupId,
      }),
    ).toMatchObject({ code: 'FORBIDDEN' });
  });
  it('부관리자는 복원할 수 있고 강등 직후에는 권한이 없어야 한다', async () => {
    const role =
      'mutation($groupId:ID!,$userId:ID!,$enabled:Boolean!){setGroupModerator(groupId:$groupId,userId:$userId,enabled:$enabled){id}}';
    await api.gqlOk(owner.cookie, role, { groupId, userId: member.id, enabled: true });
    await api.gqlOk(member.cookie, HIDE, { id: postId, hidden: false });
    expect(await api.gqlOk(undefined, POST, { id: postId })).toEqual({ galleryPost: { id: postId } });
    await api.gqlOk(owner.cookie, role, { groupId, userId: member.id, enabled: false });
    expect(await api.gqlFail(member.cookie, HIDE, { id: postId, hidden: true })).toMatchObject({
      code: 'FORBIDDEN',
    });
  });
});
