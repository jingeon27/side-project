import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { createTestApp, openStorageRedirect, type ITestApi, type ITestUser } from '../../../test/support/app';
import { createGroup } from '../../../test/support/fixtures';
import { postUpload } from '../../../test/support/group-contest';

const GROUP_FIELDS =
  'id name visibility role memberCount canViewPosts joinRequestPending inviteToken members{user{id}}';
const GROUP = `query($id:ID!){group(id:$id){${GROUP_FIELDS}}}`;
const REQUEST = `mutation($id:ID!){requestGroupMembership(groupId:$id){${GROUP_FIELDS}}}`;
const PENDING =
  'query($id:ID!,$offset:Int,$limit:Int){groupJoinRequests(groupId:$id,offset:$offset,limit:$limit){id user{id nickname} createdAt}}';
const APPROVE = 'mutation($id:ID!){approveGroupJoinRequest(requestId:$id)}';
const REJECT = 'mutation($id:ID!){rejectGroupJoinRequest(requestId:$id)}';
const POSTS =
  'query($id:ID!){galleryPosts(groupId:$id){id mediaUrl likedByMe canDelete canInteract commentCount}}';

interface IGroupPreview {
  id: string;
  name: string;
  visibility: 'PUBLIC' | 'PRIVATE';
  role: string | null;
  memberCount: number;
  canViewPosts: boolean;
  joinRequestPending: boolean;
  inviteToken: string | null;
  members: Array<{ user: { id: string } }>;
}

describe('그룹 탐색과 가입 승인', () => {
  let api: ITestApi;
  let owner: ITestUser;
  let applicant: ITestUser;
  let outsider: ITestUser;

  beforeAll(async () => {
    api = await createTestApp();
    owner = await api.signIn('탐색-그룹장');
    applicant = await api.signIn('탐색-신청자');
    outsider = await api.signIn('탐색-외부인');
  });
  afterAll(async () => {
    await api?.close();
  });

  const requestMembership = async (user: ITestUser, id: string) =>
    (await api.gqlOk<{ requestGroupMembership: IGroupPreview }>(user.cookie, REQUEST, { id }))
      .requestGroupMembership;
  const preview = async (cookie: string | undefined, id: string) =>
    (await api.gqlOk<{ group: IGroupPreview }>(cookie, GROUP, { id })).group;
  const pending = async (groupId: string) =>
    (
      await api.gqlOk<{ groupJoinRequests: Array<{ id: string; user: { id: string; nickname: string } }> }>(
        owner.cookie,
        PENDING,
        { id: groupId },
      )
    ).groupJoinRequests;

  async function createPost(groupId: string, video = false) {
    const uploadId = await postUpload(api, owner, groupId, video);
    return (
      await api.gqlOk<{ createPost: { id: string; mediaUrl: string } }>(
        owner.cookie,
        'mutation($g:ID!,$u:ID!){createPost(groupId:$g,uploadId:$u,title:"탐색 게시물",rightsConfirmed:true){id mediaUrl}}',
        { g: groupId, u: uploadId },
      )
    ).createPost;
  }

  it('로그인하지 않아도 공개·비공개 그룹을 검색·페이지 조회하고 비회원에게는 초대 토큰·멤버 명단을 주지 않아야 한다', async () => {
    const first = await createGroup(api, owner, 'DiscoveryAPI 공개');
    const second = await createGroup(api, owner, 'DiscoveryAPI 비공개', [], 'PRIVATE');
    const query = `query($search:String,$offset:Int,$limit:Int){discoverGroups(search:$search,offset:$offset,limit:$limit){${GROUP_FIELDS}}}`;
    const result = await api.gqlOk<{ discoverGroups: IGroupPreview[] }>(undefined, query, {
      search: 'discoveryapi',
      offset: 0,
      limit: 2,
    });
    expect(result.discoverGroups.map(({ id }) => id)).toEqual([second.id, first.id]);
    expect(
      result.discoverGroups.map(({ visibility, canViewPosts }) => ({ visibility, canViewPosts })),
    ).toEqual([
      { visibility: 'PRIVATE', canViewPosts: false },
      { visibility: 'PUBLIC', canViewPosts: true },
    ]);
    for (const row of result.discoverGroups)
      expect(row).toMatchObject({
        role: null,
        memberCount: 1,
        inviteToken: null,
        members: [],
        joinRequestPending: false,
      });
    expect(
      (
        await api.gqlOk<{ discoverGroups: Array<{ id: string }> }>(undefined, query, {
          search: 'DiscoveryAPI',
          offset: 1,
          limit: 1,
        })
      ).discoverGroups.map(({ id }) => id),
    ).toEqual([first.id]);
    expect(await api.db.groupMember.count({ where: { groupId: { in: [first.id, second.id] } } })).toBe(2);
    expect((await api.gqlFail(undefined, query, { search: 'a'.repeat(41) })).code).toBe('BAD_USER_INPUT');
    expect((await api.gqlFail(undefined, query, { offset: -1 })).code).toBe('BAD_USER_INPUT');
  });

  it('공개 그룹의 사진·영상 Range·댓글은 가입 없이 읽고 작성 권한과 구분해야 한다', async () => {
    const group = await createGroup(api, owner, '공개 미디어');
    const photo = await createPost(group.id);
    const video = await createPost(group.id, true);
    await api.gqlOk(owner.cookie, 'mutation($id:ID!){createPostComment(postId:$id,body:"공개 댓글"){id}}', {
      id: photo.id,
    });
    const posts = await api.gqlOk<{
      galleryPosts: Array<{ id: string; canInteract: boolean; canDelete: boolean; likedByMe: boolean }>;
    }>(undefined, POSTS, { id: group.id });
    expect(posts.galleryPosts).toHaveLength(2);
    for (const post of posts.galleryPosts)
      expect(post).toMatchObject({ canInteract: false, canDelete: false, likedByMe: false });
    expect(
      (await openStorageRedirect(await api.http().get(photo.mediaUrl.replace('/backend', '')))).status,
    ).toBe(200);
    const range = await openStorageRedirect(await api.http().get(video.mediaUrl.replace('/backend', '')), {
      Range: 'bytes=0-31',
    });
    expect(range.status).toBe(206);
    expect((await range.arrayBuffer()).byteLength).toBe(32);
    expect(
      await api.gqlOk(undefined, 'query($id:ID!){postComments(postId:$id){body canDelete}}', {
        id: photo.id,
      }),
    ).toEqual({ postComments: [{ body: '공개 댓글', canDelete: false }] });
    expect(
      (await api.gqlFail(outsider.cookie, 'mutation($id:ID!){likePost(postId:$id){id}}', { id: photo.id }))
        .code,
    ).toBe('FORBIDDEN');
    expect((await api.gqlFail(undefined, REQUEST, { id: group.id })).code).toBe('UNAUTHENTICATED');
    expect((await requestMembership(outsider, group.id)).role).toBe('MEMBER');
    expect(
      (
        await api.gqlOk<{ galleryPosts: Array<{ canInteract: boolean }> }>(outsider.cookie, POSTS, {
          id: group.id,
        })
      ).galleryPosts.every((p) => p.canInteract),
    ).toBe(true);
    await api.gqlOk(outsider.cookie, 'mutation($id:ID!){likePost(postId:$id){likedByMe}}', { id: photo.id });
  });

  it('공개 그룹 가입을 동시에 요청해도 한 멤버십만 만들고 그룹장 역할을 유지해야 한다', async () => {
    const group = await createGroup(api, owner, '공개 동시 가입');
    const results = await Promise.all(
      Array.from({ length: 5 }, () => api.gql(applicant.cookie, REQUEST, { id: group.id })),
    );
    expect(results.some((result) => !result.errors)).toBe(true);
    expect(await api.db.groupMember.count({ where: { groupId: group.id, userId: applicant.id } })).toBe(1);
    expect((await requestMembership(owner, group.id)).role).toBe('OWNER');
    expect(await api.db.groupJoinRequest.count({ where: { groupId: group.id } })).toBe(0);
  });

  it('비공개 그룹은 초대 링크를 알아도 중복 없는 신청만 만들고 승인 전 게시물·파일·댓글을 막아야 한다', async () => {
    const group = await createGroup(api, owner, '비공개 승인 대기', [], 'PRIVATE');
    const photo = await createPost(group.id);
    const results = await Promise.all(
      Array.from({ length: 5 }, () => api.gql(applicant.cookie, REQUEST, { id: group.id })),
    );
    expect(results.some((result) => !result.errors)).toBe(true);
    const invited = await api.gqlOk<{ joinGroup: IGroupPreview }>(
      applicant.cookie,
      `mutation($token:String!){joinGroup(token:$token){${GROUP_FIELDS}}}`,
      { token: group.inviteToken },
    );
    expect(invited.joinGroup).toMatchObject({
      role: null,
      canViewPosts: false,
      joinRequestPending: true,
      inviteToken: null,
    });
    expect(await api.db.groupJoinRequest.count({ where: { groupId: group.id, userId: applicant.id } })).toBe(
      1,
    );
    expect(await api.db.groupMember.count({ where: { groupId: group.id } })).toBe(1);
    expect((await api.gqlFail(applicant.cookie, POSTS, { id: group.id })).code).toBe('FORBIDDEN');
    // 그룹은 탐색에 보이지만 그 안의 게시물·파일은 승인 전까지 있는지도 알리지 않는다.
    expect((await api.http().get(photo.mediaUrl.replace('/backend', ''))).status).toBe(404);
    expect(
      (await api.http().get(photo.mediaUrl.replace('/backend', '')).set('Cookie', applicant.cookie)).status,
    ).toBe(404);
    expect(
      (await api.gqlFail(applicant.cookie, 'query($id:ID!){postComments(postId:$id){id}}', { id: photo.id }))
        .code,
    ).toBe('NOT_FOUND');
    expect((await preview(outsider.cookie, group.id)).joinRequestPending).toBe(false);
  });

  it('그룹장만 신청자 목록을 보고 승인해 가입·사진 접근을 허용해야 한다', async () => {
    const group = await createGroup(api, owner, '비공개 수락', [], 'PRIVATE');
    const post = await createPost(group.id);
    await requestMembership(applicant, group.id);
    const [request] = await pending(group.id);
    if (!request) throw new Error('가입 신청이 있어야 한다');
    expect((await api.gqlFail(applicant.cookie, PENDING, { id: group.id })).code).toBe('FORBIDDEN');
    for (const mutation of [APPROVE, REJECT])
      expect((await api.gqlFail(outsider.cookie, mutation, { id: request.id })).code).toBe('FORBIDDEN');
    await api.gqlOk(owner.cookie, APPROVE, { id: request.id });
    expect(await preview(applicant.cookie, group.id)).toMatchObject({
      role: 'MEMBER',
      canViewPosts: true,
      joinRequestPending: false,
    });
    expect(
      (await api.http().get(post.mediaUrl.replace('/backend', '')).set('Cookie', applicant.cookie)).status,
    ).toBe(307);
    expect(
      (
        await api.gqlOk<{ galleryPosts: Array<{ id: string }> }>(applicant.cookie, POSTS, { id: group.id })
      ).galleryPosts.map((p) => p.id),
    ).toEqual([post.id]);
    expect(await pending(group.id)).toEqual([]);
    expect((await api.gqlFail(applicant.cookie, APPROVE, { id: 'missing-request' })).code).toBe('NOT_FOUND');
  });

  it('거절하면 권한을 주지 않고 다시 신청할 수 있어야 한다', async () => {
    const group = await createGroup(api, owner, '비공개 거절', [], 'PRIVATE');
    await requestMembership(applicant, group.id);
    const [request] = await pending(group.id);
    if (!request) throw new Error('가입 신청이 있어야 한다');
    await api.gqlOk(owner.cookie, REJECT, { id: request.id });
    expect(await preview(applicant.cookie, group.id)).toMatchObject({
      role: null,
      canViewPosts: false,
      joinRequestPending: false,
    });
    expect(await api.db.groupMember.count({ where: { groupId: group.id, userId: applicant.id } })).toBe(0);
    expect((await requestMembership(applicant, group.id)).joinRequestPending).toBe(true);
  });

  it('공개 그룹에서도 숨긴 게시물과 기존 대회·순위를 비회원에게 노출하지 않아야 한다', async () => {
    const group = await createGroup(api, owner, '공개 숨김');
    const post = await createPost(group.id);
    await api.db.post.update({ where: { id: post.id }, data: { hidden: true } });
    expect(await api.gqlOk(undefined, POSTS, { id: group.id })).toEqual({ galleryPosts: [] });
    expect((await api.http().get(post.mediaUrl.replace('/backend', ''))).status).toBe(404);
    for (const field of ['contests{id}', 'leaderboard{rank}'])
      expect(
        (await api.gqlFail(outsider.cookie, `query($id:ID!){group(id:$id){${field}}}`, { id: group.id }))
          .code,
      ).toBe('FORBIDDEN');
    expect(
      (await api.http().get(post.mediaUrl.replace('/backend', '')).set('Cookie', owner.cookie)).status,
    ).toBe(307);
  });
});
