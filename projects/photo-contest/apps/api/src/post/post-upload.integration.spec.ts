import { PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { afterAll, afterEach, beforeAll, describe, expect, inject, it } from 'vitest';

import { createTestImage, createTestVideo } from '@photo-contest/test-kit';

import {
  createTestApp,
  openStorageRedirect,
  uploadToStorage,
  type ITestApi,
  type ITestUser,
} from '../../test/support/app';
import { createGroup } from '../../test/support/fixtures';
import { MAX_UPLOAD_BYTES, MAX_VIDEO_BYTES } from '../config/limits';

const REQUEST =
  'mutation($group:ID!,$type:String!,$size:Int!){requestPostUpload(groupId:$group,contentType:$type,byteSize:$size){id url expiresAt fields{name value}}}';
const COMPLETE = 'mutation($id:ID!){completePostUpload(uploadId:$id){id kind contentType byteSize}}';
const CREATE =
  'mutation($group:ID!,$upload:ID!){createPost(groupId:$group,uploadId:$upload,title:"직접 전송 검증",rightsConfirmed:true){id mediaUrl}}';
interface ITicket {
  id: string;
  url: string;
  expiresAt: string;
  fields: Array<{ name: string; value: string }>;
}
interface ICompleted {
  id: string;
  kind: string;
  contentType: string;
  byteSize: number;
}

describe('게시물 presigned POST 발급·직접 전송·완료 검증', () => {
  let api: ITestApi, owner: ITestUser, member: ITestUser, outsider: ITestUser, groupId: string;
  const tickets = new Set<string>();
  const ticket = async (body: Buffer, type = 'image/png', user = member, group = groupId) => {
    const { requestPostUpload } = await api.gqlOk<{ requestPostUpload: ITicket }>(user.cookie, REQUEST, {
      group,
      type,
      size: body.length,
    });
    tickets.add(requestPostUpload.id);
    return requestPostUpload;
  };
  const field = (grant: ITicket, name: string) => grant.fields.find((entry) => entry.name === name)?.value;
  const withField = (grant: ITicket, name: string, value: string) => ({
    url: grant.url,
    fields: grant.fields.map((entry) => (entry.name === name ? { name, value } : entry)),
  });
  const complete = async (grant: ITicket, user = member) =>
    (await api.gqlOk<{ completePostUpload: ICompleted }>(user.cookie, COMPLETE, { id: grant.id }))
      .completePostUpload;

  beforeAll(async () => {
    api = await createTestApp();
    owner = await api.signIn('직접 전송 관리자');
    member = await api.signIn('직접 전송 회원');
    outsider = await api.signIn('직접 전송 외부인');
    groupId = (await createGroup(api, owner, '직접 전송 비공개 그룹', [member], 'PRIVATE')).id;
  });
  afterEach(async () => {
    // 실패·만료 사양의 미게시 티켓이 다음 사양의 발급 한도에 섞이지 않게 한다.
    if (tickets.size)
      await api.db.postUpload.updateMany({
        where: { id: { in: [...tickets] }, post: null },
        data: { expiresAt: new Date(0) },
      });
    tickets.clear();
  });
  afterAll(async () => {
    await api?.close();
  });

  it('발급은 로그인한 멤버만 허용하고 최종 키·타입·정확한 크기와 15분 만료를 정책에 서명해야 한다', async () => {
    const image = await createTestImage();
    const variables = { group: groupId, type: 'image/png', size: image.length };
    expect((await api.gqlFail(undefined, REQUEST, variables)).code).toBe('UNAUTHENTICATED');
    expect((await api.gqlFail(outsider.cookie, REQUEST, variables)).code).toBe('FORBIDDEN');
    const grant = await ticket(image);
    const row = await api.db.postUpload.findUniqueOrThrow({ where: { id: grant.id } });
    expect(row).toMatchObject({
      userId: member.id,
      groupId,
      contentType: 'image/png',
      byteSize: image.length,
      storageKey: null,
    });
    expect(row.stagingKey?.startsWith(`${inject('s3Env').S3_KEY_PREFIX}/`)).toBe(true);
    const { S3_BUCKET } = inject('s3Env');
    const policy = JSON.parse(Buffer.from(field(grant, 'Policy') ?? '', 'base64').toString());
    expect(policy.conditions).toContainEqual({ bucket: S3_BUCKET });
    expect(new URL(grant.url).protocol).toBe('https:');
    expect(field(grant, 'key')).toBe(row.stagingKey);
    expect(field(grant, 'Content-Type')).toBe('image/png');
    expect(policy.conditions).toEqual(
      expect.arrayContaining([
        ['content-length-range', image.length, image.length],
        ['eq', '$Content-Type', 'image/png'],
        { key: row.stagingKey },
      ]),
    );
    expect(Date.parse(policy.expiration)).toBeLessThanOrEqual(Date.parse(grant.expiresAt));
    expect(Date.parse(grant.expiresAt) - Date.now()).toBeGreaterThan(14 * 60_000);
    expect(Date.parse(grant.expiresAt) - Date.now()).toBeLessThanOrEqual(15 * 60_000);
    await expect(api.storage.head(row.stagingKey ?? '')).rejects.toThrow();
  });

  it.each([
    { type: 'text/plain', size: 10 },
    { type: 'image/svg+xml', size: 10 },
    { type: 'image/png', size: 0 },
    { type: 'image/png', size: -1 },
    { type: 'image/png', size: MAX_UPLOAD_BYTES + 1 },
    { type: 'video/mp4', size: MAX_VIDEO_BYTES + 1 },
  ])('허용하지 않은 타입·크기로는 티켓을 발급하지 않아야 한다: %j', async (input) => {
    expect((await api.gqlFail(member.cookie, REQUEST, { group: groupId, ...input })).code).toBe(
      'BAD_USER_INPUT',
    );
  });

  it('파일 전송 전에는 완료·게시하지 못하고 완료는 티켓 소유자만 실행하며 같은 키를 확정해야 한다', async () => {
    const image = await createTestImage();
    const grant = await ticket(image);
    expect(await api.gqlFail(member.cookie, COMPLETE, { id: grant.id })).toEqual({
      code: 'BAD_USER_INPUT',
      message: '파일 전송을 완료한 뒤 다시 시도해 주세요.',
    });
    expect((await api.gqlFail(member.cookie, CREATE, { group: groupId, upload: grant.id })).code).toBe(
      'BAD_USER_INPUT',
    );
    expect((await uploadToStorage(grant, image, 'image/png')).status).toBe(204);
    expect((await api.gqlFail(undefined, COMPLETE, { id: grant.id })).code).toBe('UNAUTHENTICATED');
    expect((await api.gqlFail(owner.cookie, COMPLETE, { id: grant.id })).code).toBe('FORBIDDEN');
    expect((await api.gqlFail(member.cookie, CREATE, { group: groupId, upload: grant.id })).code).toBe(
      'BAD_USER_INPUT',
    );
    const pending = await api.db.postUpload.findUniqueOrThrow({ where: { id: grant.id } });
    expect(await complete(grant)).toEqual({
      id: grant.id,
      kind: 'PHOTO',
      contentType: 'image/png',
      byteSize: image.length,
    });
    const row = await api.db.postUpload.findUniqueOrThrow({ where: { id: grant.id } });
    expect(row).toMatchObject({ storageKey: pending.stagingKey, stagingKey: null });
    expect((row.expiresAt?.getTime() ?? 0) - Date.now()).toBeGreaterThan(59 * 60_000);
    expect(await api.storage.head(row.storageKey ?? '')).toEqual({
      byteSize: image.length,
      contentType: 'image/png',
    });
  });

  it('저장소가 실제 사진·동영상 바이트를 받고 고정 경로는 완료한 원본의 서명 GET으로 보내야 한다', async () => {
    for (const video of [false, true]) {
      const body = video ? await createTestVideo() : await createTestImage();
      const type = video ? 'video/mp4' : 'image/png';
      const grant = await ticket(body, type);
      expect((await uploadToStorage(grant, body, type)).status).toBe(204);
      expect(await complete(grant)).toMatchObject({
        kind: video ? 'VIDEO' : 'PHOTO',
        contentType: type,
        byteSize: body.length,
      });
      const { createPost } = await api.gqlOk<{ createPost: { id: string; mediaUrl: string } }>(
        member.cookie,
        CREATE,
        { group: groupId, upload: grant.id },
      );
      const response = await api
        .http()
        .get(createPost.mediaUrl.replace('/backend', ''))
        .set('Cookie', owner.cookie);
      const stored = await openStorageRedirect(response);
      expect(stored.status).toBe(200);
      expect(stored.headers.get('content-type')).toBe(type);
      expect(stored.headers.get('cache-control')).toBe('private, no-store');
      expect(Buffer.from(await stored.arrayBuffer())).toEqual(body);
    }
  });

  it('서명 정책과 다른 크기·형식·키나 추가 필드는 저장소가 거부하고 완료할 파일이 남지 않아야 한다', async () => {
    const image = await createTestImage();
    const grant = await ticket(image);
    const key = field(grant, 'key') ?? '';
    expect((await uploadToStorage(grant, image.subarray(0, image.length - 1), 'image/png')).ok).toBe(false);
    expect(
      (await uploadToStorage(grant, Buffer.concat([image, Buffer.from('extra')]), 'image/png')).status,
    ).toBe(400);
    expect(
      (await uploadToStorage(withField(grant, 'Content-Type', 'text/html'), image, 'text/html')).status,
    ).toBe(403);
    expect(
      (await uploadToStorage(withField(grant, 'key', `${key.slice(0, -4)}.mp4`), image, 'image/png')).status,
    ).toBe(403);
    expect(
      (
        await uploadToStorage(
          { url: grant.url, fields: [...grant.fields, { name: 'x-amz-meta-owner', value: 'other' }] },
          image,
          'image/png',
        )
      ).status,
    ).toBe(403);
    await expect(api.storage.head(key)).rejects.toThrow();
    expect((await api.gqlFail(member.cookie, COMPLETE, { id: grant.id })).code).toBe('BAD_USER_INPUT');
    expect((await uploadToStorage(grant, image, 'image/png')).status).toBe(204);
    expect((await complete(grant)).id).toBe(grant.id);
  });

  it('HEAD의 크기·형식이 발급과 다르면 확정하지 않고 파일 내용은 서버가 읽지 않아야 한다', async () => {
    const image = await createTestImage();
    const grant = await ticket(image);
    const key = field(grant, 'key') ?? '';
    const env = inject('s3Env');
    const client = new S3Client({
      region: env.S3_REGION,
      endpoint: env.S3_ENDPOINT,
      forcePathStyle: env.S3_FORCE_PATH_STYLE === 'true',
      ...(env.AWS_ACCESS_KEY_ID && env.AWS_SECRET_ACCESS_KEY
        ? {
            credentials: {
              accessKeyId: env.AWS_ACCESS_KEY_ID ?? '',
              secretAccessKey: env.AWS_SECRET_ACCESS_KEY ?? '',
              ...(env.AWS_SESSION_TOKEN ? { sessionToken: env.AWS_SESSION_TOKEN } : {}),
            },
          }
        : {}),
    });
    try {
      // 정책을 따르지 않는 저장소 쓰기를 흉내 낸다.
      await client.send(
        new PutObjectCommand({
          Bucket: env.S3_BUCKET,
          Key: key,
          Body: Buffer.alloc(3),
          ContentType: 'image/png',
        }),
      );
      expect(await api.gqlFail(member.cookie, COMPLETE, { id: grant.id })).toEqual({
        code: 'BAD_USER_INPUT',
        message: '업로드한 파일의 크기와 형식을 확인해 주세요.',
      });
      expect((await api.db.postUpload.findUniqueOrThrow({ where: { id: grant.id } })).storageKey).toBeNull();
    } finally {
      client.destroy();
    }
    // 서버는 바이트를 검사하지 않는다. 형식은 발급 허용 목록과 저장소 정책·응답 형식 고정으로 제한한다.
    const notImage = Buffer.from('not really a png');
    const unchecked = await ticket(notImage);
    expect((await uploadToStorage(unchecked, notImage, 'image/png')).status).toBe(204);
    expect(await complete(unchecked)).toMatchObject({ kind: 'PHOTO', byteSize: notImage.length });
  });

  it('완료 재시도와 동시 완료는 같은 결과를 돌려주고 다른 사용자는 거부해야 한다', async () => {
    const image = await createTestImage();
    const grant = await ticket(image);
    expect((await uploadToStorage(grant, image, 'image/png')).status).toBe(204);
    const [first, second, otherUser] = await Promise.all([
      api.gql<{ completePostUpload: ICompleted }>(member.cookie, COMPLETE, { id: grant.id }),
      api.gql<{ completePostUpload: ICompleted }>(member.cookie, COMPLETE, { id: grant.id }),
      api.gql<{ completePostUpload: ICompleted }>(owner.cookie, COMPLETE, { id: grant.id }),
    ]);
    expect(otherUser.errors?.[0]?.extensions?.code).toBe('FORBIDDEN');
    expect(first.data?.completePostUpload).toEqual({
      id: grant.id,
      kind: 'PHOTO',
      contentType: 'image/png',
      byteSize: image.length,
    });
    expect(second.data?.completePostUpload).toEqual(first.data?.completePostUpload);
    const stored = await api.db.postUpload.findUniqueOrThrow({ where: { id: grant.id } });
    expect(stored.storageKey).toBe(field(grant, 'key'));
    expect(await complete(grant)).toEqual(first.data?.completePostUpload);
  });

  it('만료된 티켓과 완료 전에 멤버십이 사라진 사용자의 첨부를 거부해야 한다', async () => {
    const image = await createTestImage();
    const expired = await ticket(image);
    await api.db.postUpload.update({ where: { id: expired.id }, data: { expiresAt: new Date(0) } });
    expect((await api.gqlFail(member.cookie, COMPLETE, { id: expired.id })).code).toBe('FORBIDDEN');
    const peer = await api.signIn('직접 전송 탈퇴 회원');
    const group = (await createGroup(api, owner, '직접 전송 권한 재검사', [peer], 'PRIVATE')).id;
    const grant = await ticket(image, 'image/png', peer, group);
    expect((await uploadToStorage(grant, image, 'image/png')).status).toBe(204);
    await api.db.groupMember.delete({ where: { groupId_userId: { groupId: group, userId: peer.id } } });
    expect((await api.gqlFail(peer.cookie, COMPLETE, { id: grant.id })).code).toBe('FORBIDDEN');
    expect((await api.db.postUpload.findUniqueOrThrow({ where: { id: grant.id } })).storageKey).toBeNull();
  });

  it('API에는 파일 본문을 받는 업로드 경로가 없어야 한다', async () => {
    for (const path of ['/local-post-uploads', '/post-uploads/unused', '/uploads/unused'])
      expect(
        (
          await api
            .http()
            .post(path)
            .set('Origin', 'http://web.test')
            .set('Content-Type', 'multipart/form-data; boundary=unused')
        ).status,
      ).toBe(404);
  });
});
