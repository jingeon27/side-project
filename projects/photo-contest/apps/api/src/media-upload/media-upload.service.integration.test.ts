import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { createTestImage } from '@photo-contest/test-kit';

import { createTestApp, uploadToStorage, type ITestApi, type ITestUser } from '../../test/support/app';
import { createContest, createGroup } from '../../test/support/fixtures';
import { CREATE_SUBMISSION, storedPhotoExists, uploadPhoto } from '../../test/support/photos';
import { MaintenanceService } from '../maintenance/maintenance.service';

const REQUEST_AVATAR =
  'mutation($groupId:ID!,$type:String!,$size:Int!){requestGroupAvatarUpload(groupId:$groupId,contentType:$type,byteSize:$size){id url fields{name value}}}';
const COMPLETE_AVATAR = 'mutation($id:ID!){completeGroupAvatarUpload(uploadId:$id){id}}';
const UPDATE_PROFILE =
  'mutation($groupId:ID!,$avatarId:ID){updateGroupProfile(groupId:$groupId,name:"완료 기한 그룹",description:"",avatarId:$avatarId){avatarUrl}}';
const MINUTE_MS = 60_000;

describe('MediaUploadService 완료 기한 회귀', () => {
  let api: ITestApi;
  let owner: ITestUser;
  let groupId: string;

  beforeAll(async () => {
    api = await createTestApp();
    owner = await api.signIn('완료기한-그룹장');
    groupId = (await createGroup(api, owner, '완료 기한 그룹')).id;
  });

  afterAll(async () => {
    await api?.close();
  });

  /** 요청 10분 뒤에 도는 정리 작업. 업로드 티켓(5분)과 정리 유예(5분)가 모두 지난 시각이다. */
  const cleanupTenMinutesLater = () =>
    api.app.get(MaintenanceService).cleanup(new Date(Date.now() + 10 * MINUTE_MS + 1000));

  it('완료한 그룹 대표 사진은 요청 5분 뒤에도 지정할 수 있고 정리 작업이 지우지 않아야 한다', async () => {
    // 완료가 PostUpload 기한만 늘려 GroupAvatar는 요청 5분 뒤 만료되고 10분 뒤 파일까지 지워졌다.
    const image = await createTestImage();
    const { requestGroupAvatarUpload: ticket } = await api.gqlOk<{
      requestGroupAvatarUpload: { id: string; url: string; fields: Array<{ name: string; value: string }> };
    }>(owner.cookie, REQUEST_AVATAR, { groupId, type: 'image/png', size: image.length });
    expect((await uploadToStorage(ticket, image, 'image/png')).status).toBe(204);
    await api.gqlOk(owner.cookie, COMPLETE_AVATAR, { id: ticket.id });

    const avatar = await api.db.groupAvatar.findUniqueOrThrow({ where: { id: ticket.id } });
    expect(avatar.expiresAt.getTime()).toBeGreaterThan(Date.now() + 50 * MINUTE_MS);
    await cleanupTenMinutesLater();
    expect(await api.db.groupAvatar.count({ where: { id: ticket.id } })).toBe(1);
    expect(await storedPhotoExists(api, avatar.storageKey)).toBe(true);
    const { updateGroupProfile } = await api.gqlOk<{ updateGroupProfile: { avatarUrl: string } }>(
      owner.cookie,
      UPDATE_PROFILE,
      { groupId, avatarId: ticket.id },
    );
    expect(updateGroupProfile.avatarUrl).toContain(ticket.id);
  });

  it('완료한 대회 사진은 요청 5분 뒤에도 제출할 수 있고 정리 작업이 지우지 않아야 한다', async () => {
    // Upload.expiresAt이 요청 5분 뒤로 남아 제출이 거절되고 정리 작업이 완료한 사진을 지웠다.
    const contestId = await createContest(api, owner, groupId, '완료 기한 대회');
    const uploadId = await uploadPhoto(api, owner.cookie, contestId);
    const upload = await api.db.upload.findUniqueOrThrow({ where: { id: uploadId } });
    expect(upload.expiresAt.getTime()).toBeGreaterThan(Date.now() + 50 * MINUTE_MS);
    await cleanupTenMinutesLater();
    expect(await api.db.upload.count({ where: { id: uploadId } })).toBe(1);
    expect(await storedPhotoExists(api, upload.imageKey ?? '')).toBe(true);
    expect(
      await api.gqlOk(owner.cookie, CREATE_SUBMISSION, { contestId, uploadId, caption: '늦게 제출한 사진' }),
    ).toEqual({ createSubmission: { id: expect.any(String) } });
  });
});
