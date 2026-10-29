import { randomUUID } from 'node:crypto';

import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

import { createTestImage } from '@photo-contest/test-kit';

import { createTestApp, uploadToStorage, type ITestApi, type ITestUser } from '../../test/support/app';
import { createGroup } from '../../test/support/fixtures';
import { postUpload } from '../../test/support/group-contest';
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

  it('하나의 삭제 실패가 다른 파일과 세션 정리를 막지 않고 다음 정리에서 다시 시도해야 한다', async () => {
    const first = await postUpload(api, owner, groupId);
    const second = await postUpload(api, owner, groupId);
    await api.db.postUpload.updateMany({
      where: { id: { in: [first, second] } },
      data: { expiresAt: new Date(0), policyExpiresAt: new Date(0) },
    });
    const [failing, removed] = await Promise.all(
      [first, second].map((id) => api.db.postUpload.findUniqueOrThrow({ where: { id } })),
    );
    const expired = await api.db.session.create({
      data: { tokenHash: randomUUID(), userId: owner.id, expiresAt: new Date(0) },
    });
    const originalDelete = api.storage.delete.bind(api.storage);
    const deletion = vi.spyOn(api.storage, 'delete').mockImplementation(async (key) => {
      if (key === failing?.storageKey) throw new Error('storage temporarily unavailable');
      await originalDelete(key);
    });
    try {
      await api.app.get(MaintenanceService).cleanup();
    } finally {
      deletion.mockRestore();
    }
    expect(await api.db.postUpload.findUnique({ where: { id: first } })).not.toBeNull();
    expect(await api.db.postUpload.findUnique({ where: { id: second } })).toBeNull();
    await expect(api.storage.head(removed?.storageKey ?? '')).rejects.toThrow();
    expect(await api.db.session.findUnique({ where: { tokenHash: expired.tokenHash } })).toBeNull();
    await api.app.get(MaintenanceService).cleanup();
    expect(await api.db.postUpload.findUnique({ where: { id: first } })).toBeNull();
    await expect(api.storage.head(failing?.storageKey ?? '')).rejects.toThrow();
  });

  it('완료하지 않고 만료된 티켓의 최종 키 파일을 유예 뒤에 지워 늦게 완료해도 게시에 쓰지 못해야 한다', async () => {
    const body = await createTestImage();
    const { requestPostUpload: ticket } = await api.gqlOk<{
      requestPostUpload: { id: string; url: string; fields: Array<{ name: string; value: string }> };
    }>(
      owner.cookie,
      'mutation($group:ID!,$size:Int!){requestPostUpload(groupId:$group,contentType:"image/png",byteSize:$size){id url fields{name value}}}',
      { group: groupId, size: body.length },
    );
    expect((await uploadToStorage(ticket, body, 'image/png')).status).toBe(204);
    const { stagingKey } = await api.db.postUpload.findUniqueOrThrow({ where: { id: ticket.id } });
    const expiredAt = new Date(Date.now() - 1000);
    await api.db.postUpload.update({
      where: { id: ticket.id },
      data: { expiresAt: expiredAt, policyExpiresAt: expiredAt },
    });
    // 막 만료된 키는 만료 직전에 시작한 완료 확정과 겹칠 수 있어 유예 시간 동안 남긴다.
    await api.app.get(MaintenanceService).cleanup();
    expect(await api.storage.head(stagingKey ?? '')).toMatchObject({ byteSize: body.length });
    expect((await api.db.postUpload.findUniqueOrThrow({ where: { id: ticket.id } })).stagingKey).toBe(
      stagingKey,
    );
    await api.app.get(MaintenanceService).cleanup(new Date(Date.now() + 6 * 60_000));
    await expect(api.storage.head(stagingKey ?? '')).rejects.toThrow();
    expect(await api.db.postUpload.findUnique({ where: { id: ticket.id } })).toBeNull();
  });
});
