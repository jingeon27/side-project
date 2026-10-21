import { readdir } from 'node:fs/promises';

import sharp from 'sharp';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

import { createTestImage } from '@photo-contest/test-kit';

import { createTestApp, type ITestApi, type ITestUser } from '../../test/support/app';
import { moveContestTo } from '../../test/support/clock';
import { createContest, createGroup, type ITestGroup } from '../../test/support/fixtures';
import {
  COMPLETE_UPLOAD,
  CREATE_SUBMISSION,
  postPhoto,
  requestUpload,
  submitPhoto,
  uploadPhoto,
} from '../../test/support/photos';
import type { TDatabaseClient } from '../database/database.service';
import { UnitOfWork } from '../database/unit-of-work';
import { MaintenanceService } from '../maintenance/maintenance.service';
import { MediaStorage } from '../storage/media-storage.service';

const NOT_SUBMISSION_PHASE = { code: 'BAD_USER_INPUT', message: '사진 제출 기간이 아닙니다.' };
const UPLOAD_INCOMPLETE = {
  code: 'BAD_USER_INPUT',
  message: '사진 업로드가 완료되지 않았거나 만료되었습니다.',
};
const REQUEST_UPLOAD =
  'mutation($contestId: ID!) { requestUploadUrl(contestId: $contestId,contentType:"image/png",byteSize:1) { id } }';

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

  it('대회 사진 예약은 지원하는 사진 형식과 10MB 이하 크기만 허용해야 한다', async () => {
    const contestId = await createContest(api, owner, group.id, '대회 예약 검사');
    const query =
      'mutation($id:ID!,$type:String!,$size:Int!){requestUploadUrl(contestId:$id,contentType:$type,byteSize:$size){id}}';
    for (const [type, size] of [
      ['video/mp4', 100],
      ['image/png', 0],
      ['image/png', 10 * 1024 * 1024 + 1],
    ] as const)
      expect((await api.gqlFail(friend.cookie, query, { id: contestId, type, size })).code).toBe(
        'BAD_USER_INPUT',
      );
    expect(await api.db.upload.count({ where: { contestId } })).toBe(0);
  });

  it('완료 DB 커밋 응답을 잃어도 대회 사진과 업로드 상태를 함께 보존해야 한다', async () => {
    const contestId = await createContest(api, owner, group.id, '대회 커밋 복구');
    const bytes = await createTestImage();
    const ticket = await requestUpload(api, friend.cookie, contestId, bytes);
    await postPhoto(api, ticket, bytes);
    const transactions = api.app.get(UnitOfWork);
    const atomic = transactions.atomic.bind(transactions);
    let calls = 0;
    const failure = vi
      .spyOn(transactions, 'atomic')
      .mockImplementation(async <T>(work: (tx: TDatabaseClient) => Promise<T>) => {
        const result = await atomic(work);
        if (++calls === 2) throw new Error('Commit response lost');
        return result;
      });
    try {
      await api.gqlOk(friend.cookie, COMPLETE_UPLOAD, { id: ticket.id });
    } finally {
      failure.mockRestore();
    }
    const upload = await api.db.upload.findUniqueOrThrow({
      where: { id: ticket.id },
      include: { mediaUpload: true },
    });
    expect(upload.imageKey).toBe(upload.mediaUpload?.storageKey);
    expect(upload.imageKey).toBeTruthy();
    expect(await api.app.get(MediaStorage).head(upload.imageKey ?? '')).toMatchObject({
      contentType: 'image/webp',
    });
  });

  it('파일 확인 중 대회가 마감되면 대회 사진을 확정하지 않아야 한다', async () => {
    const contestId = await createContest(api, owner, group.id, '대회 확인 중 마감');
    const bytes = await createTestImage();
    const ticket = await requestUpload(api, friend.cookie, contestId, bytes);
    await postPhoto(api, ticket, bytes);
    const storage = api.app.get(MediaStorage);
    const originalCopy = storage.copy.bind(storage);
    const copying = vi.spyOn(storage, 'copy').mockImplementation(async (source, destination) => {
      await originalCopy(source, destination);
      await moveContestTo(api, contestId, 'VOTING');
    });
    try {
      expect(await api.gqlFail(friend.cookie, COMPLETE_UPLOAD, { id: ticket.id })).toEqual(
        NOT_SUBMISSION_PHASE,
      );
    } finally {
      copying.mockRestore();
    }
    const row = await api.db.upload.findUniqueOrThrow({
      where: { id: ticket.id },
      include: { mediaUpload: true },
    });
    expect(row.imageKey).toBeNull();
    expect(row.mediaUpload?.storageKey).toBeNull();
  });

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

  it('서명된 크기·타입의 파일만 저장소로 보내고 완료 전 제출을 거부해야 한다', async () => {
    const contestId = await createContest(api, owner, group.id, '직접 업로드 계약');
    const bytes = await createTestImage();
    const ticket = await requestUpload(api, friend.cookie, contestId, bytes);
    expect(ticket.url).toMatch(/^\/backend\/local-post-uploads\?/);
    const ttl = Date.parse(ticket.expiresAt) - Date.now();
    expect(ttl).toBeGreaterThan(4.5 * 60_000);
    expect(ttl).toBeLessThanOrEqual(5 * 60_000);
    expect((await postPhoto(api, ticket, Buffer.concat([bytes, Buffer.from('extra')]))).status).toBe(400);
    expect(
      await api.gqlFail(friend.cookie, CREATE_SUBMISSION, {
        contestId,
        uploadId: ticket.id,
        caption: '미완료',
      }),
    ).toEqual(UPLOAD_INCOMPLETE);
    expect((await postPhoto(api, ticket, bytes)).status).toBe(201);
    expect(
      await api.gqlFail(friend.cookie, CREATE_SUBMISSION, {
        contestId,
        uploadId: ticket.id,
        caption: '완료 전',
      }),
    ).toEqual(UPLOAD_INCOMPLETE);
    await api.gqlOk(friend.cookie, COMPLETE_UPLOAD, { id: ticket.id });
    expect((await api.db.upload.findUniqueOrThrow({ where: { id: ticket.id } })).imageKey).toMatch(/\.webp$/);
  });

  it('사진이 아닌 파일·움직이는 사진·픽셀 폭탄은 완료할 수 없어야 한다', async () => {
    const contestId = await createContest(api, owner, group.id, '실제 파일 검사');
    const frames = await Promise.all(
      ['#ff0000', '#00ff00'].map((background) =>
        sharp({ create: { width: 30, height: 20, channels: 3, background } })
          .png()
          .toBuffer(),
      ),
    );
    const files = [
      Buffer.from('not an image'),
      await solidImage(20, 20).gif().toBuffer(),
      await sharp(frames, { join: { animated: true } })
        .webp()
        .toBuffer(),
      await solidImage(8000, 5001).png().toBuffer(),
    ];
    for (const bytes of files) {
      const ticket = await requestUpload(api, friend.cookie, contestId, bytes);
      expect((await postPhoto(api, ticket, bytes)).status).toBe(201);
      expect((await api.gqlFail(friend.cookie, COMPLETE_UPLOAD, { id: ticket.id })).code).toBe(
        'BAD_USER_INPUT',
      );
      expect((await api.db.upload.findUniqueOrThrow({ where: { id: ticket.id } })).imageKey).toBeNull();
    }
  });

  it('완료는 소유자만 할 수 있고 staging 재전송은 확정한 사진을 바꾸지 않아야 한다', async () => {
    const contestId = await createContest(api, owner, group.id, '소유권과 재전송');
    const bytes = await createTestImage();
    const ticket = await requestUpload(api, friend.cookie, contestId, bytes);
    expect((await postPhoto(api, ticket, bytes)).status).toBe(201);
    expect((await api.gqlFail(voter.cookie, COMPLETE_UPLOAD, { id: ticket.id })).code).toBe('FORBIDDEN');
    await api.gqlOk(friend.cookie, COMPLETE_UPLOAD, { id: ticket.id });
    const before = await api.db.upload.findUniqueOrThrow({ where: { id: ticket.id } });
    expect((await postPhoto(api, ticket, Buffer.alloc(bytes.length))).status).toBe(201);
    await api.gqlOk(friend.cookie, COMPLETE_UPLOAD, { id: ticket.id });
    expect((await api.db.upload.findUniqueOrThrow({ where: { id: ticket.id } })).imageKey).toBe(
      before.imageKey,
    );
    const created = await api.gqlOk<{ createSubmission: { id: string } }>(friend.cookie, CREATE_SUBMISSION, {
      contestId,
      uploadId: ticket.id,
      caption: '고정된 사진',
    });
    expect((await getPhoto(created.createSubmission.id, friend.cookie)).status).toBe(200);
    expect(
      (
        await api.gqlFail(friend.cookie, 'mutation($id:ID!){completePostUpload(uploadId:$id){id}}', {
          id: before.mediaUploadId,
        })
      ).code,
    ).toBe('FORBIDDEN');
    expect(
      (
        await api.gqlFail(
          friend.cookie,
          'mutation($group:ID!,$id:ID!){createPost(groupId:$group,uploadId:$id,title:"잘못된 용도",rightsConfirmed:true){id}}',
          { group: group.id, id: before.mediaUploadId },
        )
      ).code,
    ).toBe('BAD_USER_INPUT');
    await api.app.get(MaintenanceService).cleanup(new Date(Date.now() + 24 * 60 * 60_000));
    expect((await getPhoto(created.createSubmission.id, friend.cookie)).status).toBe(200);
  });

  it('만료되거나 접수 마감 뒤인 업로드는 완료할 수 없어야 한다', async () => {
    const contestId = await createContest(api, owner, group.id, '완료 만료');
    const bytes = await createTestImage();
    const expired = await requestUpload(api, friend.cookie, contestId, bytes);
    await postPhoto(api, expired, bytes);
    await api.db.upload.update({
      where: { id: expired.id },
      data: { expiresAt: new Date(Date.now() - 1000) },
    });
    expect((await api.gqlFail(friend.cookie, COMPLETE_UPLOAD, { id: expired.id })).code).toBe(
      'BAD_USER_INPUT',
    );
    const late = await requestUpload(api, friend.cookie, contestId, bytes);
    await postPhoto(api, late, bytes);
    await moveContestTo(api, contestId, 'VOTING');
    expect(await api.gqlFail(friend.cookie, COMPLETE_UPLOAD, { id: late.id })).toEqual(NOT_SUBMISSION_PHASE);
  });

  it('동시 완료는 최종 사진을 하나만 확정하고 이후 완료는 같은 결과여야 한다', async () => {
    const contestId = await createContest(api, owner, group.id, '동시 완료');
    const bytes = await createTestImage();
    const ticket = await requestUpload(api, friend.cookie, contestId, bytes);
    await postPhoto(api, ticket, bytes);
    const responses = await Promise.all(
      Array.from({ length: 5 }, () => api.gql(friend.cookie, COMPLETE_UPLOAD, { id: ticket.id })),
    );
    expect(responses.some((response) => !response.errors)).toBe(true);
    await api.gqlOk(friend.cookie, COMPLETE_UPLOAD, { id: ticket.id });
    const row = await api.db.upload.findUniqueOrThrow({ where: { id: ticket.id } });
    expect((await readdir(api.storageDir)).filter((file) => file === row.imageKey)).toHaveLength(1);
    expect(await api.db.postUploadAttempt.count({ where: { uploadId: row.mediaUploadId } })).toBe(0);
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
