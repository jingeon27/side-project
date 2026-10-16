import { readdir } from 'node:fs/promises';

import { createTestImage, createTestVideo } from '@photo-contest/test-kit';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { koreanMonth } from '../../src/post/post-order';
import { createTestApp, TEST_WEB_ORIGIN, type ITestApi, type ITestUser } from '../support/app';
import { createGroup } from '../support/fixtures';

const FIELDS = 'id groupId title body kind mediaUrl likeCount likedByMe canDelete author { id }';
const LIST = `query($groupId:ID,$sort:PostSort,$offset:Int,$limit:Int){galleryPosts(groupId:$groupId,sort:$sort,offset:$offset,limit:$limit){${FIELDS}}}`;
interface IPost {
  id: string;
  groupId: string;
  title: string;
  kind: string;
  mediaUrl: string;
  likeCount: number;
  likedByMe: boolean;
  canDelete: boolean;
}
describe('상시 갤러리 게시물', () => {
  let api: ITestApi,
    owner: ITestUser,
    member: ITestUser,
    outsider: ITestUser,
    groupId: string,
    otherId: string;
  const list = async (user: ITestUser, variables: Record<string, unknown> = {}) =>
    (await api.gqlOk<{ galleryPosts: IPost[] }>(user.cookie, LIST, variables)).galleryPosts;
  const ticket = async (user: ITestUser, id = groupId) =>
    (
      await api.gqlOk<{ requestPostUpload: { id: string; url: string } }>(
        user.cookie,
        'mutation($id:ID!){requestPostUpload(groupId:$id){id url}}',
        { id },
      )
    ).requestPostUpload;
  const upload = async (user: ITestUser, grant: { url: string }, body: Buffer, type = 'image/png') =>
    api
      .http()
      .post(grant.url.replace('/backend', ''))
      .set('Origin', TEST_WEB_ORIGIN)
      .set('Cookie', user.cookie)
      .set('Content-Type', type)
      .send(body);
  const create = async (user: ITestUser, title: string, video = false) => {
    const grant = await ticket(user);
    expect(
      (
        await upload(
          user,
          grant,
          video ? await createTestVideo() : await createTestImage(),
          video ? 'video/mp4' : 'image/png',
        )
      ).status,
    ).toBe(201);
    return (
      await api.gqlOk<{ createPost: IPost }>(
        user.cookie,
        `mutation($group:ID!,$upload:ID!,$title:String!){createPost(groupId:$group,uploadId:$upload,title:$title,body:"본문",rightsConfirmed:true){${FIELDS}}}`,
        { group: groupId, upload: grant.id, title },
      )
    ).createPost;
  };
  beforeAll(async () => {
    api = await createTestApp();
    owner = await api.signIn('갤러리 관리자');
    member = await api.signIn('갤러리 회원');
    outsider = await api.signIn('갤러리 외부인');
    groupId = (await createGroup(api, owner, '상시 갤러리', [member])).id;
    otherId = (await createGroup(api, outsider, '외부 갤러리')).id;
  });
  afterAll(async () => {
    await api?.close();
  });
  const multipart = async (
    cookie: string | undefined,
    uploadId: string,
    bytes: Buffer,
    contentType = 'image/png',
    origin = TEST_WEB_ORIGIN,
  ) => {
    const req = api.http().post('/graphql').set('Origin', origin).set('Apollo-Require-Preflight', 'true');
    if (cookie) req.set('Cookie', cookie);
    return req
      .field(
        'operations',
        JSON.stringify({
          query: 'mutation($uploadId:ID!,$file:Upload!){uploadPostMedia(uploadId:$uploadId,file:$file)}',
          variables: { uploadId, file: null },
        }),
      )
      .field('map', JSON.stringify({ '0': ['variables.file'] }))
      .attach('0', bytes, { filename: 'upload', contentType });
  };
  it('GraphQL multipart로 실제 사진·동영상을 올리고 재사용은 거절해야 한다', async () => {
    for (const video of [false, true]) {
      const grant = await ticket(member);
      const res = await multipart(
        member.cookie,
        grant.id,
        video ? await createTestVideo() : await createTestImage(),
        video ? 'video/mp4' : 'image/png',
      );
      expect(res.body).toEqual({ data: { uploadPostMedia: true } });
      const stored = await api.db.postUpload.findUniqueOrThrow({ where: { id: grant.id } });
      expect(stored.kind).toBe(video ? 'VIDEO' : 'PHOTO');
      expect(stored.storageKey).toBeTruthy();
      expect(
        (await multipart(member.cookie, grant.id, await createTestImage())).body.errors[0].extensions.code,
      ).toBe('FORBIDDEN');
    }
  });
  it('multipart도 인증·티켓 소유자·Origin·실제 파일 내용을 검사해야 한다', async () => {
    const grant = await ticket(member);
    const image = await createTestImage();
    expect((await multipart(undefined, grant.id, image)).body.errors[0].extensions.code).toBe(
      'UNAUTHENTICATED',
    );
    expect((await multipart(owner.cookie, grant.id, image)).body.errors[0].extensions.code).toBe('FORBIDDEN');
    expect(
      (await multipart(member.cookie, grant.id, image, 'image/png', 'https://evil.example')).status,
    ).toBe(403);
    expect(
      (await multipart(member.cookie, grant.id, Buffer.from('fake image'))).body.errors[0].extensions.code,
    ).toBe('BAD_USER_INPUT');
    expect((await api.db.postUpload.findUniqueOrThrow({ where: { id: grant.id } })).storageKey).toBeNull();
    const malformed = await api
      .http()
      .post('/graphql')
      .set('Origin', TEST_WEB_ORIGIN)
      .set('Apollo-Require-Preflight', 'true')
      .field('operations', 'broken json');
    expect(malformed.status).toBe(400);
    expect(malformed.body.message).toBeTruthy();
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
  it('외부인·다른 갤러리의 업로드와 조작한 동영상은 거부하고 티켓을 재사용할 수 없어야 한다', async () => {
    expect((await api.gqlFail(outsider.cookie, LIST, { groupId })).code).toBe('FORBIDDEN');
    const grant = await ticket(member);
    expect((await upload(outsider, grant, await createTestImage())).status).toBe(403);
    expect((await upload(member, grant, Buffer.from('fake mp4'), 'video/mp4')).status).toBe(400);
    expect((await upload(member, grant, await createTestImage())).status).toBe(201);
    expect((await upload(member, grant, await createTestImage())).status).toBe(403);
    expect(
      (
        await api.gqlFail(
          member.cookie,
          'mutation($g:ID!,$u:ID!){createPost(groupId:$g,uploadId:$u,title:"조작",rightsConfirmed:true){id}}',
          { g: otherId, u: grant.id },
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
    await api.gqlOk(peer.cookie, 'mutation($token:String!){joinGroup(token:$token){id}}', {
      token: group.inviteToken,
    });
    expect((await list(owner, { groupId })).find((p) => p.id === post.id)?.canDelete).toBe(true);
    expect((await api.gqlFail(peer.cookie, del, { id: post.id })).code).toBe('FORBIDDEN');
    const before = (await readdir(api.storageDir)).length;
    await api.gqlOk(owner.cookie, del, { id: post.id });
    expect((await list(member, { groupId })).some((p) => p.id === post.id)).toBe(false);
    expect((await readdir(api.storageDir)).length).toBe(before - 1);
    expect(
      (await api.http().get(post.mediaUrl.replace('/backend', '')).set('Cookie', owner.cookie)).status,
    ).toBe(404);
    await api.gqlOk(member.cookie, del, { id: (await create(member, '직접 삭제')).id });
  });
});
