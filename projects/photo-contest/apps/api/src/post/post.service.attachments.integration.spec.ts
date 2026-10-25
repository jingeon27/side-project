import { afterAll, beforeAll, describe, expect, inject, it, vi } from 'vitest';

import { createTestApp, openStorageRedirect, type ITestApi, type ITestUser } from '../../test/support/app';
import { createGroup } from '../../test/support/fixtures';
import { postUpload } from '../../test/support/group-contest';

const FIELDS = 'id title kind mediaUrl linkUrl canInteract';
const CREATE = `mutation($group:ID!,$upload:ID,$link:String,$title:String!){createPost(groupId:$group,uploadId:$upload,linkUrl:$link,title:$title,rightsConfirmed:true){${FIELDS}}}`;
const DOWNLOAD = 'query($id:ID!){postDownload(postId:$id){url filename expiresAt}}';
interface IPost {
  id: string;
  title: string;
  kind: string;
  mediaUrl: string | null;
  linkUrl: string | null;
}
interface IDownload {
  url: string;
  filename: string;
  expiresAt: string | null;
}

describe('링크 게시물과 미디어 저장', () => {
  let api: ITestApi, owner: ITestUser, outsider: ITestUser, publicId: string, privateId: string;
  beforeAll(async () => {
    api = await createTestApp();
    owner = await api.signIn('첨부 사양 작성자');
    outsider = await api.signIn('첨부 사양 외부인');
    publicId = (await createGroup(api, owner, '첨부 공개 그룹')).id;
    privateId = (await createGroup(api, owner, '첨부 비공개 그룹', [], 'PRIVATE')).id;
  });
  afterAll(async () => {
    await api?.close();
  });
  const create = async (group: string, link: string | null, upload?: string, title = '첨부한 웃긴 순간') =>
    (await api.gqlOk<{ createPost: IPost }>(owner.cookie, CREATE, { group, link, upload, title })).createPost;
  const media = async (group: string, video = false, link: string | null = null) => {
    const uploadId = await postUpload(api, owner, group, video);
    return create(group, link, uploadId, video ? '저장할 동영상' : '저장할 한글 사진');
  };

  it('파일 없는 유튜브·일반 링크를 만들고 공개 그룹에서 익명으로 읽어야 한다', async () => {
    for (const link of ['https://youtu.be/abcdefghijk', 'https://example.com/community?item=1']) {
      const post = await create(publicId, link);
      expect(post).toMatchObject({ kind: 'LINK', mediaUrl: null, linkUrl: link });
      const { galleryPosts } = await api.gqlOk<{ galleryPosts: IPost[] }>(
        undefined,
        `query($group:ID!){galleryPosts(groupId:$group){${FIELDS}}}`,
        { group: publicId },
      );
      expect(galleryPosts).toContainEqual(
        expect.objectContaining({ id: post.id, linkUrl: link, canInteract: false }),
      );
      expect((await api.gqlFail(undefined, DOWNLOAD, { id: post.id })).code).toBe('NOT_FOUND');
    }
  });
  it('빈 첨부·위험한 주소·회원이 아닌 사용자의 작성과 비공개 조회를 거부해야 한다', async () => {
    for (const link of [
      null,
      '',
      'javascript:alert(1)',
      'data:text/html,test',
      'https://user:password@example.com',
    ])
      expect(
        (await api.gqlFail(owner.cookie, CREATE, { group: publicId, link, title: '잘못된 첨부' })).code,
      ).toBe('BAD_USER_INPUT');
    expect(
      (
        await api.gqlFail(outsider.cookie, CREATE, {
          group: publicId,
          link: 'https://example.com',
          title: '외부 작성',
        })
      ).code,
    ).toBe('FORBIDDEN');
    const post = await create(privateId, 'https://example.com/private');
    expect(
      (await api.gqlFail(undefined, `query($id:ID!){galleryPosts(groupId:$id){linkUrl}}`, { id: privateId }))
        .code,
    ).toBe('UNAUTHENTICATED');
    expect((await api.gqlFail(outsider.cookie, DOWNLOAD, { id: post.id })).code).toBe('NOT_FOUND');
  });
  it('링크 글의 반응·댓글·삭제는 기존 게시물 권한과 cascade를 따라야 한다', async () => {
    const post = await create(publicId, 'https://example.com/delete');
    await api.gqlOk(
      owner.cookie,
      'mutation($id:ID!){likePost(postId:$id){id} createPostComment(postId:$id,body:"링크 댓글"){id}}',
      { id: post.id },
    );
    expect(
      (await api.gqlFail(outsider.cookie, 'mutation($id:ID!){deletePost(postId:$id)}', { id: post.id })).code,
    ).toBe('FORBIDDEN');
    expect(
      await api.gqlOk(owner.cookie, 'mutation($id:ID!){deletePost(postId:$id)}', { id: post.id }),
    ).toEqual({ deletePost: true });
    expect(await api.db.postComment.count({ where: { postId: post.id } })).toBe(0);
    expect(await api.db.postLike.count({ where: { postId: post.id } })).toBe(0);
  });
  it('DB에서도 첨부 없는 게시물 저장을 막아야 한다', async () => {
    await expect(
      api.db.post.create({ data: { groupId: publicId, authorId: owner.id, title: '빈 첨부' } }),
    ).rejects.toThrow();
  });
  it.each([false, true])(
    '사진·동영상을 첨부 링크와 함께 올리고 파일로 저장해야 한다: video=%s',
    async (video) => {
      const post = await media(publicId, video, 'https://example.com/source');
      expect(post.linkUrl).toBe('https://example.com/source');
      const { postDownload: download } = await api.gqlOk<{ postDownload: IDownload }>(undefined, DOWNLOAD, {
        id: post.id,
      });
      const url = new URL(download.url);
      expect(`${url.origin}/${url.pathname.split('/')[1]}`).toBe(
        `${inject('s3Env').S3_ENDPOINT}/${inject('s3Env').S3_BUCKET}`,
      );
      expect(url.searchParams.get('X-Amz-Expires')).toBe('60');
      expect(Date.parse(download.expiresAt ?? '') - Date.now()).toBeGreaterThan(55_000);
      expect(download.filename).toBe(video ? '저장할 동영상.mp4' : '저장할 한글 사진.png');
      const response = await fetch(download.url);
      expect(response.status).toBe(200);
      expect(response.headers.get('content-disposition')).toContain("filename*=UTF-8''");
      expect(response.headers.get('content-type')).toContain(video ? 'video/mp4' : 'image/png');
      expect(response.headers.get('cache-control')).toBe('private, no-store');
      const range = await fetch(download.url, { headers: { Range: 'bytes=0-3' } });
      expect(range.status).toBe(206);
      expect(range.headers.get('content-length')).toBe('4');
    },
  );
  it('비공개 다운로드는 매번 권한을 확인하고 숨긴 파일·삭제된 파일을 외부에 내주지 않아야 한다', async () => {
    const post = await media(privateId);
    // 비공개 그룹의 게시물 ID는 비멤버(비로그인 포함)에게 없는 게시물과 같은 응답이다.
    for (const cookie of [undefined, outsider.cookie]) {
      const query = await api.gqlFail(cookie, DOWNLOAD, { id: post.id });
      expect(query).toEqual({ code: 'NOT_FOUND', message: '게시물을 찾을 수 없습니다.' });
      const req = api.http().get(`/media/${post.id}/download`);
      if (cookie) req.set('Cookie', cookie);
      expect((await req).status).toBe(404);
    }
    const attachment = await openStorageRedirect(
      await api.http().get(`/media/${post.id}/download`).set('Cookie', owner.cookie),
    );
    expect(attachment.headers.get('content-disposition')).toContain('attachment;');
    await api.db.post.update({ where: { id: post.id }, data: { hidden: true } });
    expect((await api.gqlFail(undefined, DOWNLOAD, { id: post.id })).code).toBe('NOT_FOUND');
    await api.gqlOk(owner.cookie, 'mutation($id:ID!){deletePost(postId:$id)}', { id: post.id });
    expect((await api.http().get(`/media/${post.id}/download`).set('Cookie', owner.cookie)).status).toBe(404);
    const hidden = await media(publicId);
    await api.db.post.update({ where: { id: hidden.id }, data: { hidden: true } });
    expect((await api.gqlFail(undefined, DOWNLOAD, { id: hidden.id })).code).toBe('NOT_FOUND');
    expect((await api.http().get(`/media/${hidden.id}/download`)).status).toBe(404);
  });
  it('운영 S3 설정에서도 권한 확인 뒤 60초 서명 URL을 발급하고 파일명·캐시 헤더까지 서명해야 한다', async () => {
    const post = await media(privateId);
    vi.stubEnv('S3_BUCKET', 'attachments');
    vi.stubEnv('S3_REGION', 'ap-northeast-2');
    vi.stubEnv('S3_ENDPOINT', 'https://s3.example.test');
    vi.stubEnv('S3_FORCE_PATH_STYLE', 'true');
    vi.stubEnv('AWS_ACCESS_KEY_ID', 'test-access-key');
    vi.stubEnv('AWS_SECRET_ACCESS_KEY', 'test-secret-key');
    const { postDownload } = await api.gqlOk<{ postDownload: IDownload }>(owner.cookie, DOWNLOAD, {
      id: post.id,
    });
    const url = new URL(postDownload.url);
    expect(url.origin).toBe('https://s3.example.test');
    expect(url.pathname).toMatch(/^\/attachments\/[a-f0-9-]{36}\.png$/);
    expect(url.searchParams.get('X-Amz-Expires')).toBe('60');
    expect(url.searchParams.get('X-Amz-Signature')).toMatch(/^[a-f0-9]{64}$/);
    expect(url.searchParams.get('response-content-disposition')).toContain('attachment;');
    expect(url.searchParams.get('response-cache-control')).toBe('private, no-store');
    expect(Date.parse(postDownload.expiresAt ?? '') - Date.now()).toBeGreaterThan(55_000);
    expect((await api.gqlFail(outsider.cookie, DOWNLOAD, { id: post.id })).code).toBe('NOT_FOUND');
  });
});
