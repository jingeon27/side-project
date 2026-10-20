import { createHash } from 'node:crypto';
import { readdir } from 'node:fs/promises';

import { createTestImage } from '@photo-contest/test-kit';
import sharp from 'sharp';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { createTestApp } from '../../test/support/app';
import type { ITestApi, ITestUser } from '../../test/support/app';
import { moveContestTo } from '../../test/support/clock';
import { createContest, createGroup } from '../../test/support/fixtures';
import type { ITestGroup } from '../../test/support/fixtures';
import {
  CREATE_SUBMISSION,
  postPhoto,
  requestUpload,
  submitPhoto,
  uploadPhoto,
} from '../../test/support/photos';

const PHOTO_ERROR = {
  INVALID_BODY: '10MB 이하의 JPEG, PNG, WebP 사진을 선택해 주세요.',
  UNSUPPORTED: '지원하지 않는 사진 형식 또는 크기입니다.',
  UNREADABLE: '사진을 읽을 수 없습니다. JPEG, PNG, WebP 파일을 확인해 주세요.',
};
const UPLOAD_REJECTED = { message: '업로드 요청이 만료되었거나 유효하지 않습니다.' };
const NOT_SUBMISSION_PHASE = { code: 'BAD_USER_INPUT', message: '사진 제출 기간이 아닙니다.' };
const UPLOAD_INCOMPLETE = {
  code: 'BAD_USER_INPUT',
  message: '사진 업로드가 완료되지 않았거나 만료되었습니다.',
};
const REQUEST_UPLOAD = 'mutation($contestId: ID!) { requestUploadUrl(contestId: $contestId) { id } }';

function solidImage(width: number, height: number) {
  return sharp({ create: { width, height, channels: 3, background: '#316447' } });
}

describe('사진 업로드와 열람', () => {
  let api: ITestApi;
  let owner: ITestUser;
  let friend: ITestUser;
  let voter: ITestUser;
  let outsider: ITestUser;
  let group: ITestGroup;

  beforeAll(async () => {
    api = await createTestApp();
    owner = await api.signIn('업로드-관리자');
    friend = await api.signIn('업로드-친구');
    voter = await api.signIn('업로드-투표자');
    outsider = await api.signIn('업로드-외부인');
    group = await createGroup(api, owner, '업로드 그룹', [friend, voter]);
  });

  afterAll(async () => {
    await api?.close();
  });

  function getPhoto(photoId: string, cookie?: string) {
    const pending = api.http().get(`/photos/${photoId}`);
    return cookie ? pending.set('Cookie', cookie) : pending;
  }

  it('사진을 EXIF 방향대로 돌린 1600px 이하 WebP로 바꾸고 그룹 멤버에게만 제공해야 한다', async () => {
    const contestId = await createContest(api, owner, group.id, '변환 대회');
    // 가로 2400 × 세로 1200 원본에 '90도 회전' 방향과 촬영 정보 EXIF를 넣는다.
    const original = await solidImage(2400, 1200)
      .jpeg()
      .withExif({ IFD0: { Copyright: 'secret-photographer', ImageDescription: 'home-address' } })
      .withMetadata({ orientation: 6 })
      .toBuffer();
    expect((await sharp(original).metadata()).exif).toBeDefined();
    const photoId = await submitPhoto(api, owner, contestId, '관리자의 사진', original);

    const denied = await getPhoto(photoId, outsider.cookie);
    expect(denied.status).toBe(403);
    expect(denied.body).toEqual({ message: '이 그룹에 접근할 권한이 없습니다.' });
    const anonymous = await getPhoto(photoId);
    expect(anonymous.status).toBe(401);

    const allowed = await getPhoto(photoId, friend.cookie);
    expect(allowed.status).toBe(200);
    expect(allowed.headers['content-type']).toBe('image/webp');
    expect(allowed.headers['cache-control']).toBe('private, no-store');
    expect(allowed.headers['x-content-type-options']).toBe('nosniff');
    const photo: Buffer = allowed.body;
    const metadata = await sharp(photo).metadata();
    expect(metadata).toMatchObject({ format: 'webp', width: 800, height: 1600 });
    expect(metadata.exif).toBeUndefined();
    expect(metadata.orientation).toBeUndefined();
    expect(photo.includes('secret-photographer')).toBe(false);

    const missing = await getPhoto('missing-photo', friend.cookie);
    expect(missing.status).toBe(404);
    expect(missing.body).toEqual({ message: '사진을 찾을 수 없습니다.' });
  });

  it('중복 제출과 거짓 이미지 파일을 거부해야 한다', async () => {
    const contestId = await createContest(api, owner, group.id, '중복 대회');
    const photoId = await submitPhoto(api, owner, contestId, '처음 낸 사진');

    const ticket = await requestUpload(api, owner.cookie, contestId);
    const fake = await postPhoto(api, owner.cookie, ticket.path, 'not an image', 'image/png');
    expect(fake.status).toBe(400);
    expect(fake.body).toEqual({ message: PHOTO_ERROR.UNREADABLE });

    const original = await api.db.submission.findUniqueOrThrow({ where: { id: photoId } });
    expect(
      await api.gqlFail(owner.cookie, CREATE_SUBMISSION, {
        contestId,
        uploadId: original.uploadId,
        caption: '같은 업로드로 다시',
      }),
    ).toEqual({ code: 'CONFLICT', message: '이미 제출하거나 투표했습니다.' });
    const secondUpload = await uploadPhoto(api, owner.cookie, contestId);
    expect(
      await api.gqlFail(owner.cookie, CREATE_SUBMISSION, {
        contestId,
        uploadId: secondUpload,
        caption: '두 번째',
      }),
    ).toEqual({ code: 'CONFLICT', message: '이미 제출하거나 투표했습니다.' });
    expect(await api.db.submission.count({ where: { contestId, authorId: owner.id } })).toBe(1);
  });

  it('JPEG·PNG·WebP로 실제 디코딩되는 40MP·10MB 이하 사진만 받아야 한다', async () => {
    const contestId = await createContest(api, owner, group.id, '형식 대회');
    const ticket = await requestUpload(api, friend.cookie, contestId);
    const photo = await createTestImage();
    const noisyJpeg = await sharp({
      create: {
        width: 400,
        height: 400,
        channels: 3,
        background: '#808080',
        noise: { type: 'gaussian', mean: 128, sigma: 30 },
      },
    })
      .jpeg()
      .toBuffer();
    const frame = (color: string) =>
      sharp({ create: { width: 40, height: 30, channels: 3, background: color } })
        .png()
        .toBuffer();
    const rejected: Array<[string, Buffer | string, string, number, string]> = [
      ['사진이 아닌 Content-Type', photo, 'text/plain', 400, PHOTO_ERROR.INVALID_BODY],
      [
        'GIF Content-Type',
        await solidImage(20, 20).gif().toBuffer(),
        'image/gif',
        400,
        PHOTO_ERROR.INVALID_BODY,
      ],
      ['빈 본문', Buffer.alloc(0), 'image/png', 400, PHOTO_ERROR.INVALID_BODY],
      ['10MB 초과', Buffer.alloc(10 * 1024 * 1024 + 1), 'image/png', 413, PHOTO_ERROR.INVALID_BODY],
      [
        'PNG로 보낸 GIF',
        await solidImage(20, 20).gif().toBuffer(),
        'image/png',
        400,
        PHOTO_ERROR.UNSUPPORTED,
      ],
      [
        '움직이는 WebP',
        await sharp([await frame('#ff0000'), await frame('#00ff00')], { join: { animated: true } })
          .webp()
          .toBuffer(),
        'image/webp',
        400,
        PHOTO_ERROR.UNSUPPORTED,
      ],
      ['40MP 초과', await solidImage(8000, 5001).png().toBuffer(), 'image/png', 400, PHOTO_ERROR.UNSUPPORTED],
      [
        '중간이 잘린 JPEG',
        noisyJpeg.subarray(0, noisyJpeg.length / 2),
        'image/jpeg',
        400,
        PHOTO_ERROR.UNREADABLE,
      ],
    ];
    for (const [name, body, contentType, status, message] of rejected) {
      const response = await postPhoto(api, friend.cookie, ticket.path, body, contentType);
      expect(response.status, name).toBe(status);
      expect(response.body, name).toEqual({ message });
    }

    // 거절된 시도는 티켓을 쓰지 않는다. Content-Type과 실제 형식이 달라도 실제 형식으로 판단한다.
    const accepted = await postPhoto(api, friend.cookie, ticket.path, photo, 'image/jpeg');
    expect(accepted.status).toBe(201);
    expect(accepted.body).toEqual({ uploaded: true });
  });

  it('업로드 티켓은 주인이 제출 기간에 한 번만 쓸 수 있어야 한다', async () => {
    const contestId = await createContest(api, owner, group.id, '티켓 대회');
    const photo = await createTestImage();
    const ticket = await requestUpload(api, friend.cookie, contestId);
    expect(ticket.url).toMatch(/^\/backend\/uploads\/[A-Za-z0-9_-]{43}$/);
    const ttl = Date.parse(ticket.expiresAt) - Date.now();
    expect(ttl).toBeGreaterThan(4.5 * 60 * 1000);
    expect(ttl).toBeLessThanOrEqual(5 * 60 * 1000);
    // 티켓 원문은 DB에 남기지 않는다.
    const token = ticket.path.slice('/uploads/'.length);
    const stored = await api.db.upload.findUniqueOrThrow({ where: { id: ticket.id } });
    expect(stored.tokenHash).toBe(createHash('sha256').update(token).digest('hex'));

    const stranger = await postPhoto(api, voter.cookie, ticket.path, photo);
    expect(stranger.status).toBe(403);
    expect(stranger.body).toEqual(UPLOAD_REJECTED);
    expect((await postPhoto(api, friend.cookie, ticket.path, photo)).status).toBe(201);
    const reused = await postPhoto(api, friend.cookie, ticket.path, photo);
    expect(reused.status).toBe(403);
    expect(reused.body).toEqual(UPLOAD_REJECTED);

    const expired = await requestUpload(api, friend.cookie, contestId);
    await api.db.upload.update({
      where: { id: expired.id },
      data: { expiresAt: new Date(Date.now() - 1000) },
    });
    expect((await postPhoto(api, friend.cookie, expired.path, photo)).status).toBe(403);

    const late = await requestUpload(api, voter.cookie, contestId);
    await moveContestTo(api, contestId, 'VOTING');
    const afterDeadline = await postPhoto(api, voter.cookie, late.path, photo);
    expect(afterDeadline.status).toBe(400);
    expect(afterDeadline.body).toEqual({ message: NOT_SUBMISSION_PHASE.message });
  });

  it('같은 티켓으로 동시에 올려도 사진 한 장만 저장하고 나머지 파일은 남기지 않아야 한다', async () => {
    const contestId = await createContest(api, owner, group.id, '동시 업로드 대회');
    const ticket = await requestUpload(api, friend.cookie, contestId);
    const photo = await createTestImage();
    const before = (await readdir(api.storageDir)).length;

    const responses = await Promise.all(
      Array.from({ length: 5 }, () => postPhoto(api, friend.cookie, ticket.path, photo)),
    );
    expect(responses.filter((response) => response.status === 201)).toHaveLength(1);
    for (const response of responses.filter((item) => item.status !== 201))
      expect([400, 403]).toContain(response.status);

    const upload = await api.db.upload.findUniqueOrThrow({ where: { id: ticket.id } });
    expect(upload.imageKey).not.toBeNull();
    const files = await readdir(api.storageDir);
    expect(files).toHaveLength(before + 1);
    expect(files).toContain(upload.imageKey);
  });

  it('제출 기간이 아니면 업로드 티켓을 주지 않아야 한다', async () => {
    const contestId = await createContest(api, owner, group.id, '기간 밖 대회');
    for (const phase of ['UPCOMING', 'VOTING', 'COMPLETED'] as const) {
      await moveContestTo(api, contestId, phase);
      expect(await api.gqlFail(friend.cookie, REQUEST_UPLOAD, { contestId }), phase).toEqual(
        NOT_SUBMISSION_PHASE,
      );
    }
    expect(await api.gqlFail(outsider.cookie, REQUEST_UPLOAD, { contestId })).toEqual({
      code: 'FORBIDDEN',
      message: '이 그룹에 접근할 권한이 없습니다.',
    });
  });

  it('제출하지 않은 유효한 업로드 티켓은 사용자·대회마다 10개까지만 줘야 한다', async () => {
    const contestId = await createContest(api, owner, group.id, '티켓 한도 대회');
    const tickets = [];
    for (let index = 0; index < 10; index++) tickets.push(await requestUpload(api, voter.cookie, contestId));
    expect(await api.gqlFail(voter.cookie, REQUEST_UPLOAD, { contestId })).toEqual({
      code: 'RATE_LIMITED',
      message: '업로드 요청이 너무 많습니다. 잠시 후 다시 시도해 주세요.',
    });
    // 다른 사용자의 한도는 따로 센다.
    await requestUpload(api, friend.cookie, contestId);
    // 만료된 티켓은 한도에서 빠진다.
    await api.db.upload.update({
      where: { id: tickets[0]!.id },
      data: { expiresAt: new Date(Date.now() - 1000) },
    });
    await requestUpload(api, voter.cookie, contestId);
  });

  it('제출하려면 권리 확인·사진 설명·본인이 이 대회에 올린 사진이 있어야 한다', async () => {
    const contestId = await createContest(api, owner, group.id, '제출 검사 대회');
    const otherContest = await createContest(api, owner, group.id, '다른 대회');
    const uploadId = await uploadPhoto(api, friend.cookie, contestId);

    expect(
      await api.gqlFail(friend.cookie, CREATE_SUBMISSION, {
        contestId,
        uploadId,
        caption: '설명',
        rightsConfirmed: false,
      }),
    ).toEqual({ code: 'BAD_USER_INPUT', message: '사진 사용 권리와 촬영된 사람의 동의를 확인해 주세요.' });
    for (const caption of ['', '  ', '가'.repeat(161)])
      expect(await api.gqlFail(friend.cookie, CREATE_SUBMISSION, { contestId, uploadId, caption })).toEqual({
        code: 'BAD_USER_INPUT',
        message: '사진 설명은(는) 1~160자여야 합니다.',
      });

    const unfinished = await requestUpload(api, friend.cookie, contestId);
    const otherContestUpload = await uploadPhoto(api, friend.cookie, otherContest);
    for (const candidate of [unfinished.id, otherContestUpload, 'missing-upload'])
      expect(
        await api.gqlFail(friend.cookie, CREATE_SUBMISSION, {
          contestId,
          uploadId: candidate,
          caption: '설명',
        }),
      ).toEqual(UPLOAD_INCOMPLETE);
    expect(
      await api.gqlFail(voter.cookie, CREATE_SUBMISSION, { contestId, uploadId, caption: '남의 사진' }),
    ).toEqual(UPLOAD_INCOMPLETE);
    expect(
      await api.gqlFail(outsider.cookie, CREATE_SUBMISSION, { contestId, uploadId, caption: '외부인' }),
    ).toEqual({ code: 'FORBIDDEN', message: '이 그룹에 접근할 권한이 없습니다.' });

    const created = await api.gqlOk<{ createSubmission: Record<string, unknown> }>(
      friend.cookie,
      `mutation($contestId: ID!, $uploadId: ID!) {
        createSubmission(contestId: $contestId, uploadId: $uploadId, caption: "  친구의 사진  ", rightsConfirmed: true) {
          contestId caption author { id } hidden voteCount likeCount likedByMe reportCount reports { id } imageUrl
        }
      }`,
      { contestId, uploadId },
    );
    expect(created.createSubmission).toEqual({
      contestId,
      caption: '친구의 사진',
      author: { id: friend.id },
      hidden: false,
      voteCount: null,
      likeCount: 0,
      likedByMe: false,
      reportCount: null,
      reports: null,
      imageUrl: expect.stringMatching(/^\/backend\/photos\/\w+$/),
    });
  });

  it('제출 기간이 끝나면 올려 둔 사진도 제출할 수 없어야 한다', async () => {
    const contestId = await createContest(api, owner, group.id, '마감 제출 대회');
    const uploadId = await uploadPhoto(api, friend.cookie, contestId);
    await moveContestTo(api, contestId, 'VOTING');
    expect(
      await api.gqlFail(friend.cookie, CREATE_SUBMISSION, { contestId, uploadId, caption: '늦은 제출' }),
    ).toEqual(NOT_SUBMISSION_PHASE);
  });

  it('두 장을 동시에 제출해도 사용자마다 한 장만 남아야 한다', async () => {
    const contestId = await createContest(api, owner, group.id, '동시 제출 대회');
    const uploads = [
      await uploadPhoto(api, voter.cookie, contestId),
      await uploadPhoto(api, voter.cookie, contestId),
    ];
    const results = await Promise.all(
      uploads.map((uploadId) =>
        api.gql(voter.cookie, CREATE_SUBMISSION, { contestId, uploadId, caption: '동시' }),
      ),
    );
    expect(results.filter((result) => !result.errors)).toHaveLength(1);
    expect(results.find((result) => result.errors)?.errors?.[0]?.extensions?.code).toBe('CONFLICT');
    expect(await api.db.submission.count({ where: { contestId, authorId: voter.id } })).toBe(1);
  });
});
