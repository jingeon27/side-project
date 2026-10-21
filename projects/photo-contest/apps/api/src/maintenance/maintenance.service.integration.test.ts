import { randomUUID } from 'node:crypto';

import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

import { createTestImage } from '@photo-contest/test-kit';

import { createTestApp, type ITestApi, type ITestUser } from '../../test/support/app';
import { createGroup } from '../../test/support/fixtures';
import { postUpload } from '../../test/support/group-contest';
import { createMediaKey, MediaStorage } from '../storage/media-storage.service';
import { MaintenanceService } from './maintenance.service';

describe('직접 업로드 파일 정리 회귀', () => {
  let api: ITestApi, owner: ITestUser, groupId: string;
  beforeAll(async () => {
    api = await createTestApp();
    owner = await api.signIn('파일 정리 회귀');
    groupId = (await createGroup(api, owner, '파일 정리 회귀 그룹')).id;
  });
  afterAll(async () => {
    await api?.close();
  });
  it('복사 후 중단된 후보를 회수하고 하나의 삭제 실패가 다른 파일과 세션 정리를 막지 않아야 한다', async () => {
    const first = await postUpload(api, owner, groupId);
    const second = await postUpload(api, owner, groupId);
    await api.db.postUpload.updateMany({
      where: { id: { in: [first, second] } },
      data: { expiresAt: new Date(0) },
    });
    const file = await api.db.postUpload.findUniqueOrThrow({ where: { id: first } });
    const candidate = createMediaKey('png');
    await api.app.get(MediaStorage).put(candidate, await createTestImage(), 'image/png');
    await api.db.postUploadAttempt.create({
      data: { key: candidate, uploadId: first, createdAt: new Date(0) },
    });
    const expired = await api.db.session.create({
      data: { tokenHash: randomUUID(), userId: owner.id, expiresAt: new Date(0) },
    });
    const media = api.app.get(MediaStorage);
    const originalDelete = media.delete.bind(media);
    const deletion = vi.spyOn(media, 'delete').mockImplementation(async (key) => {
      if (key === file.storageKey) throw new Error('disk temporarily unavailable');
      await originalDelete(key);
    });
    try {
      await api.app.get(MaintenanceService).cleanup();
    } finally {
      deletion.mockRestore();
    }
    expect(await api.db.postUploadAttempt.findUnique({ where: { key: candidate } })).toBeNull();
    await expect(media.head(candidate)).rejects.toThrow();
    expect(await api.db.postUpload.findUnique({ where: { id: first } })).not.toBeNull();
    expect(await api.db.postUpload.findUnique({ where: { id: second } })).toBeNull();
    expect(await api.db.session.findUnique({ where: { tokenHash: expired.tokenHash } })).toBeNull();
    await api.app.get(MaintenanceService).cleanup();
    expect(await api.db.postUpload.findUnique({ where: { id: first } })).toBeNull();
  });
  it('사용자나 그룹 삭제로 티켓이 사라져도 고아 후보 추적을 유지해야 한다', async () => {
    const id = await postUpload(api, owner, groupId);
    const key = createMediaKey('png');
    const media = api.app.get(MediaStorage);
    await media.put(key, await createTestImage(), 'image/png');
    await api.db.postUploadAttempt.create({ data: { key, uploadId: id, createdAt: new Date(0) } });
    const upload = await api.db.postUpload.findUniqueOrThrow({ where: { id } });
    if (upload.storageKey) await media.delete(upload.storageKey);
    await api.db.postUpload.delete({ where: { id } });
    expect((await api.db.postUploadAttempt.findUniqueOrThrow({ where: { key } })).uploadId).toBeNull();
    await api.app.get(MaintenanceService).cleanup();
    expect(await api.db.postUploadAttempt.findUnique({ where: { key } })).toBeNull();
    await expect(media.head(key)).rejects.toThrow();
  });
});
