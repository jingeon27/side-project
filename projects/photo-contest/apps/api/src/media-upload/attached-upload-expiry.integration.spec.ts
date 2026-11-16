import { randomUUID } from 'node:crypto';

import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { createTestApp, type ITestApi, type ITestUser } from '../../test/support/app';
import { createContest, createGroup } from '../../test/support/fixtures';
import { CREATE_SUBMISSION } from '../../test/support/photos';
import { MaintenanceService } from '../maintenance/maintenance.service';
import { createMediaKey } from '../storage/media-storage.service';

const HOUR_MS = 60 * 60_000;
const CREATE_POST =
  'mutation($group:ID!,$upload:ID!){createPost(groupId:$group,uploadId:$upload,title:"만료 없는 글",rightsConfirmed:true){id}}';
const UPDATE_PROFILE =
  'mutation($groupId:ID!,$avatarId:ID,$remove:Boolean!){updateGroupProfile(groupId:$groupId,name:"만료 그룹",description:"",avatarId:$avatarId,removeAvatar:$remove){id}}';

describe('붙은 업로드의 만료', () => {
  let api: ITestApi;
  let owner: ITestUser;
  let groupId: string;

  beforeAll(async () => {
    api = await createTestApp();
    owner = await api.signIn('붙은업로드-그룹장');
    groupId = (await createGroup(api, owner, '붙은 업로드 그룹')).id;
  });

  afterAll(async () => {
    await api?.close();
  });

  /** 저장소 전송과 HEAD 완료를 마친 상태의 업로드(완료 후 1시간 동안 쓸 수 있다) */
  const completedUpload = () =>
    api.db.postUpload.create({
      data: {
        userId: owner.id,
        groupId,
        tokenHash: randomUUID(),
        storageKey: createMediaKey('png'),
        expiresAt: new Date(Date.now() + HOUR_MS),
        kind: 'PHOTO',
        contentType: 'image/png',
        byteSize: 128,
      },
    });
  const expiryOf = async (id: string) =>
    (await api.db.postUpload.findUnique({ where: { id }, select: { expiresAt: true } }))?.expiresAt;
  const cleanupLater = (ms: number) => api.app.get(MaintenanceService).cleanup(new Date(Date.now() + ms));

  it('게시물에 붙인 업로드는 만료를 비우고 정리 작업이 기한 뒤에도 지우지 않아야 한다', async () => {
    const upload = await completedUpload();
    await api.gqlOk(owner.cookie, CREATE_POST, { group: groupId, upload: upload.id });
    expect(await expiryOf(upload.id)).toBeNull();
    await cleanupLater(3 * HOUR_MS);
    expect(await expiryOf(upload.id)).toBeNull();
  });

  it('제출한 대회 사진의 원본 업로드도 만료를 비워야 한다', async () => {
    const contestId = await createContest(api, owner, groupId, '만료 없는 대회');
    const upload = await completedUpload();
    const grant = await api.db.upload.create({
      data: {
        tokenHash: randomUUID(),
        userId: owner.id,
        contestId,
        imageKey: upload.storageKey,
        mediaUploadId: upload.id,
        expiresAt: new Date(Date.now() + HOUR_MS),
      },
    });
    await api.gqlOk(owner.cookie, CREATE_SUBMISSION, { contestId, uploadId: grant.id, caption: '만료 없음' });
    expect(await expiryOf(upload.id)).toBeNull();
  });

  it('대표 사진으로 쓰는 동안 만료를 비우고 교체해 정리되면 원본 업로드도 지워야 한다', async () => {
    const upload = await completedUpload();
    const avatar = await api.db.groupAvatar.create({
      data: {
        groupId,
        mediaUploadId: upload.id,
        storageKey: upload.storageKey ?? '',
        expiresAt: new Date(Date.now() + HOUR_MS),
      },
    });
    await api.gqlOk(owner.cookie, UPDATE_PROFILE, { groupId, avatarId: avatar.id, remove: false });
    expect(await expiryOf(upload.id)).toBeNull();
    await cleanupLater(3 * HOUR_MS);
    expect(await api.db.groupAvatar.count({ where: { id: avatar.id } })).toBe(1);

    await api.gqlOk(owner.cookie, UPDATE_PROFILE, { groupId, avatarId: null, remove: true });
    await cleanupLater(3 * HOUR_MS);
    expect(await api.db.groupAvatar.count({ where: { id: avatar.id } })).toBe(0);
    expect(await api.db.postUpload.count({ where: { id: upload.id } })).toBe(0);
  });

  it('제출하지 않은 대회 사진을 정리하면 원본 업로드 행과 용량도 함께 정리해야 한다', async () => {
    const contestId = await createContest(api, owner, groupId, '제출하지 않은 대회');
    const upload = await completedUpload();
    const grant = await api.db.upload.create({
      data: {
        tokenHash: randomUUID(),
        userId: owner.id,
        contestId,
        imageKey: upload.storageKey,
        mediaUploadId: upload.id,
        expiresAt: new Date(Date.now() + HOUR_MS),
      },
    });
    await cleanupLater(3 * HOUR_MS);
    expect(await api.db.upload.count({ where: { id: grant.id } })).toBe(0);
    expect(await api.db.postUpload.count({ where: { id: upload.id } })).toBe(0);
  });

  it('기존 사진을 지우면 함께 지워지는 이관 게시물의 업로드를 정리 대상으로 돌려야 한다', async () => {
    const contestId = await createContest(api, owner, groupId, '이관 삭제 대회');
    const upload = await api.db.postUpload.update({
      where: { id: (await completedUpload()).id },
      data: { expiresAt: null },
    });
    const grant = await api.db.upload.create({
      data: {
        tokenHash: randomUUID(),
        userId: owner.id,
        contestId,
        imageKey: createMediaKey('png'),
        expiresAt: new Date(),
      },
    });
    const submission = await api.db.submission.create({
      data: { contestId, authorId: owner.id, caption: '이관 사진', uploadId: grant.id },
    });
    await api.db.post.create({
      data: {
        groupId,
        authorId: owner.id,
        title: '이관 사진',
        uploadId: upload.id,
        legacySubmissionId: submission.id,
      },
    });
    await api.gqlOk(owner.cookie, 'mutation($id:ID!){deleteSubmission(submissionId:$id)}', {
      id: submission.id,
    });
    expect((await expiryOf(upload.id))?.getTime()).toBeLessThanOrEqual(Date.now());
  });
});
