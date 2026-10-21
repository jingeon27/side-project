import { readFile, readdir } from 'node:fs/promises';
import { request as httpRequest, type Server } from 'node:http';
import { join } from 'node:path';

import { createTestImage, createTestVideo } from '@photo-contest/test-kit';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';

import { createTestApp, TEST_WEB_ORIGIN, type ITestApi, type ITestUser } from '../../test/support/app';
import { createGroup } from '../../test/support/fixtures';
import { MAX_INPUT_PIXELS, MAX_UPLOAD_BYTES, MAX_VIDEO_BYTES } from '../config/limits';
import { createLocalUploadGrant } from '../storage/local-upload-grant';

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
  const upload = (grant: ITicket, body: Buffer, type = 'image/png', fields = grant.fields) => {
    const request = api.http().post(grant.url.replace('/backend', '')).set('Origin', TEST_WEB_ORIGIN);
    for (const field of fields) request.field(field.name, field.value);
    return request.attach('file', body, { filename: 'media', contentType: type });
  };
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

  it('발급은 로그인한 멤버만 허용하고 키·타입·크기와 15분 만료를 서버가 정해야 한다', async () => {
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
    expect(row.stagingKey).toMatch(/^staging\/[a-f0-9-]{36}$/);
    expect(grant.fields).toEqual([
      { name: 'key', value: row.stagingKey },
      { name: 'Content-Type', value: 'image/png' },
    ]);
    expect(Date.parse(grant.expiresAt) - Date.now()).toBeGreaterThan(14 * 60_000);
    expect(Date.parse(grant.expiresAt) - Date.now()).toBeLessThanOrEqual(15 * 60_000);
    await expect(readFile(join(api.storageDir, row.stagingKey ?? 'missing'))).rejects.toMatchObject({
      code: 'ENOENT',
    });
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

  it('파일 전송과 검증 완료 전에는 게시하지 못하고 완료는 티켓 소유자만 실행해야 한다', async () => {
    const image = await createTestImage();
    const grant = await ticket(image);
    expect((await api.gqlFail(member.cookie, COMPLETE, { id: grant.id })).code).toBe('BAD_USER_INPUT');
    expect((await api.gqlFail(member.cookie, CREATE, { group: groupId, upload: grant.id })).code).toBe(
      'BAD_USER_INPUT',
    );
    expect((await upload(grant, image)).status).toBe(201);
    expect((await api.gqlFail(undefined, COMPLETE, { id: grant.id })).code).toBe('UNAUTHENTICATED');
    expect((await api.gqlFail(owner.cookie, COMPLETE, { id: grant.id })).code).toBe('FORBIDDEN');
    expect((await api.gqlFail(member.cookie, CREATE, { group: groupId, upload: grant.id })).code).toBe(
      'BAD_USER_INPUT',
    );
    expect(await complete(grant)).toEqual({
      id: grant.id,
      kind: 'PHOTO',
      contentType: 'image/png',
      byteSize: image.length,
    });
    const row = await api.db.postUpload.findUniqueOrThrow({ where: { id: grant.id } });
    expect(row.storageKey).toMatch(/^[a-f0-9-]{36}\.png$/);
    expect(row.storageKey).not.toBe(row.stagingKey);
    expect(row.expiresAt.getTime() - Date.now()).toBeGreaterThan(59 * 60_000);
  });

  it('저장소 POST는 쿠키 없이 실제 사진·동영상 바이트를 받고 완료 후 원본을 그대로 제공해야 한다', async () => {
    for (const video of [false, true]) {
      const body = video ? await createTestVideo() : await createTestImage();
      const type = video ? 'video/mp4' : 'image/png';
      const grant = await ticket(body, type);
      const sent = await upload(grant, body, type);
      expect(sent.status).toBe(201);
      expect(sent.headers['cache-control']).toContain('no-store');
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
      expect(response.status).toBe(200);
      expect(response.headers['content-type']).toContain(type);
      expect(Number(response.headers['content-length'])).toBe(body.length);
      const stored = await api.db.postUpload.findUniqueOrThrow({ where: { id: grant.id } });
      expect(await readFile(join(api.storageDir, stored.storageKey ?? 'missing'))).toEqual(body);
    }
  });

  it('POST 폼의 정확한 크기·타입·키와 파일 앞의 필드를 검사하고 실패한 본문을 저장하지 않아야 한다', async () => {
    const image = await createTestImage();
    const grant = await ticket(image);
    const wrongFields = (name: string, value: string) =>
      grant.fields.map((field) => (field.name === name ? { name, value } : field));
    expect((await upload(grant, image.subarray(0, image.length - 1))).status).toBe(400);
    expect((await upload(grant, Buffer.concat([image, Buffer.from('extra')]))).status).toBe(400);
    expect((await upload(grant, image, 'image/jpeg')).status).toBe(400);
    expect((await upload(grant, image, 'image/png', wrongFields('Content-Type', 'image/jpeg'))).status).toBe(
      400,
    );
    expect((await upload(grant, image, 'image/png', wrongFields('key', '../outside.png'))).status).toBe(400);
    expect(
      (await upload(grant, image, 'image/png', [...grant.fields, { name: 'extra', value: 'ignored' }]))
        .status,
    ).toBe(400);
    const reversed = api
      .http()
      .post(grant.url.replace('/backend', ''))
      .set('Origin', TEST_WEB_ORIGIN)
      .attach('file', image, { filename: 'media', contentType: 'image/png' });
    for (const field of grant.fields) reversed.field(field.name, field.value);
    expect((await reversed).status).toBe(400);
    const row = await api.db.postUpload.findUniqueOrThrow({ where: { id: grant.id } });
    await expect(readFile(join(api.storageDir, row.stagingKey ?? 'missing'))).rejects.toMatchObject({
      code: 'ENOENT',
    });
    expect((await readdir(api.storageDir)).some((name) => name.endsWith('.upload'))).toBe(false);
    expect((await upload(grant, image)).status).toBe(201);
    expect((await complete(grant)).id).toBe(grant.id);
  });

  it('서명 주소 재전송과 완료 재시도는 허용하되 완료 후 staging 덮어쓰기가 게시 파일을 바꾸지 못해야 한다', async () => {
    const image = await createTestImage();
    const grant = await ticket(image);
    expect((await upload(grant, image)).status).toBe(201);
    expect((await upload(grant, image)).status).toBe(201);
    const first = await complete(grant);
    const saved = await api.db.postUpload.findUniqueOrThrow({ where: { id: grant.id } });
    expect((await upload(grant, Buffer.alloc(image.length))).status).toBe(201);
    expect(await complete(grant)).toEqual(first);
    expect((await api.db.postUpload.findUniqueOrThrow({ where: { id: grant.id } })).storageKey).toBe(
      saved.storageKey,
    );
    const { createPost } = await api.gqlOk<{ createPost: { id: string; mediaUrl: string } }>(
      member.cookie,
      CREATE,
      { group: groupId, upload: grant.id },
    );
    expect(
      (await api.http().get(createPost.mediaUrl.replace('/backend', '')).set('Cookie', owner.cookie)).body,
    ).toEqual(image);
    expect(await readFile(join(api.storageDir, saved.storageKey ?? 'missing'))).toEqual(image);
  });

  it('잘못된 이미지·실제 형식 불일치·픽셀 폭탄과 손상 동영상은 완료하지 않고 복사 후보를 정리해야 한다', async () => {
    const bomb = Buffer.from(await createTestImage());
    bomb.writeUInt32BE(MAX_INPUT_PIXELS + 1, 16);
    bomb.writeUInt32BE(1, 20);
    for (const [body, type] of [
      [Buffer.from('fake image'), 'image/png'],
      [await createTestImage({ format: 'jpeg' }), 'image/png'],
      [bomb, 'image/png'],
      [Buffer.from('fake video'), 'video/mp4'],
    ] as const) {
      const grant = await ticket(body, type);
      expect((await upload(grant, body, type)).status).toBe(201);
      expect((await api.gqlFail(member.cookie, COMPLETE, { id: grant.id })).code).toBe('BAD_USER_INPUT');
      expect(await api.db.postUpload.findUniqueOrThrow({ where: { id: grant.id } })).toMatchObject({
        storageKey: null,
        completionKey: null,
        completionStartedAt: null,
      });
      expect(await api.db.postUploadAttempt.count({ where: { uploadId: grant.id } })).toBe(0);
    }
  });

  it('동일 티켓의 동시 완료는 최종 파일 하나만 남기고 다른 사용자를 거부하며 재시도는 같은 결과를 반환해야 한다', async () => {
    const image = await createTestImage();
    const grant = await ticket(image);
    expect((await upload(grant, image)).status).toBe(201);
    const before = new Set(await readdir(api.storageDir));
    const [first, second, otherUser] = await Promise.all([
      api.gql<{ completePostUpload: ICompleted }>(member.cookie, COMPLETE, { id: grant.id }),
      api.gql<{ completePostUpload: ICompleted }>(member.cookie, COMPLETE, { id: grant.id }),
      api.gql<{ completePostUpload: ICompleted }>(owner.cookie, COMPLETE, { id: grant.id }),
    ]);
    expect(otherUser.errors?.[0]?.extensions?.code).toBe('FORBIDDEN');
    const successes = [first, second].filter((result) => result.data?.completePostUpload);
    expect(successes.length).toBeGreaterThanOrEqual(1);
    for (const result of [first, second]) {
      if (result.errors?.length) expect(result.errors[0]?.extensions?.code).toBe('CONFLICT');
      if (result.data) expect(result.data.completePostUpload.id).toBe(grant.id);
    }
    const stored = await api.db.postUpload.findUniqueOrThrow({ where: { id: grant.id } });
    expect(stored.storageKey).toMatch(/^[a-f0-9-]{36}\.png$/);
    expect(stored.completionKey).toBeNull();
    expect(stored.completionStartedAt).toBeNull();
    expect(await api.db.postUploadAttempt.count({ where: { uploadId: grant.id } })).toBe(0);
    expect(
      (await readdir(api.storageDir)).filter((name) => name.endsWith('.png') && !before.has(name)),
    ).toEqual([stored.storageKey]);
    expect(await readFile(join(api.storageDir, stored.storageKey ?? 'missing'))).toEqual(image);
    expect(await complete(grant)).toEqual(successes[0]?.data?.completePostUpload);
  });

  it('만료된 티켓과 완료 전에 멤버십이 사라진 사용자의 첨부를 거부해야 한다', async () => {
    const image = await createTestImage();
    const expired = await ticket(image);
    await api.db.postUpload.update({ where: { id: expired.id }, data: { expiresAt: new Date(0) } });
    expect((await api.gqlFail(member.cookie, COMPLETE, { id: expired.id })).code).toBe('FORBIDDEN');
    const peer = await api.signIn('직접 전송 탈퇴 회원');
    const group = (await createGroup(api, owner, '직접 전송 권한 재검사', [peer], 'PRIVATE')).id;
    const grant = await ticket(image, 'image/png', peer, group);
    expect((await upload(grant, image)).status).toBe(201);
    await api.db.groupMember.delete({ where: { groupId_userId: { groupId: group, userId: peer.id } } });
    expect((await api.gqlFail(peer.cookie, COMPLETE, { id: grant.id })).code).toBe('FORBIDDEN');
    expect((await api.db.postUpload.findUniqueOrThrow({ where: { id: grant.id } })).storageKey).toBeNull();
  });

  it('만료·변조된 로컬 서명과 다른 Origin은 본문 저장 전에 거부해야 한다', async () => {
    const image = await createTestImage();
    const grant = await ticket(image);
    const tampered = new URL(grant.url, TEST_WEB_ORIGIN);
    tampered.searchParams.set('signature', 'a'.repeat(43));
    expect(
      (
        await api
          .http()
          .post(tampered.pathname.replace('/backend', '') + tampered.search)
          .set('Origin', TEST_WEB_ORIGIN)
      ).status,
    ).toBe(403);
    const row = await api.db.postUpload.findUniqueOrThrow({ where: { id: grant.id } });
    const expired = createLocalUploadGrant({
      key: row.stagingKey ?? '',
      contentType: 'image/png',
      byteSize: image.length,
      expiresAt: Date.now() - 1,
    });
    expect(
      (await api.http().post(expired.url.replace('/backend', '')).set('Origin', TEST_WEB_ORIGIN)).status,
    ).toBe(403);
    expect(
      (await api.http().post(grant.url.replace('/backend', '')).set('Origin', 'https://evil.example')).status,
    ).toBe(403);
  });

  it('서명 없는 100MB 요청은 본문을 한 바이트도 보내지 않은 상태에서 즉시 403으로 응답해야 한다', async () => {
    const server = api.app.getHttpServer() as Server;
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    try {
      const address = server.address();
      if (!address || typeof address === 'string') throw new Error('격리 HTTP 포트가 필요합니다.');
      const status = await new Promise<number | undefined>((resolve, reject) => {
        const pending = httpRequest(
          {
            host: '127.0.0.1',
            port: address.port,
            method: 'POST',
            path: '/local-post-uploads',
            headers: {
              Origin: TEST_WEB_ORIGIN,
              'Content-Type': 'multipart/form-data; boundary=unsigned',
              'Content-Length': MAX_VIDEO_BYTES,
            },
          },
          (response) => {
            response.resume();
            response.once('end', () => {
              pending.destroy();
              resolve(response.statusCode);
            });
          },
        );
        pending.once('error', reject);
        pending.setTimeout(2000, () => pending.destroy(new Error('본문을 보내기 전에 응답하지 않았습니다.')));
        pending.flushHeaders();
      });
      expect(status).toBe(403);
    } finally {
      await new Promise<void>((resolve, reject) =>
        server.close((error) => (error ? reject(error) : resolve())),
      );
    }
  });
});
