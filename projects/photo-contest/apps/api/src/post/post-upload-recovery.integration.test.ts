import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

import { createTestImage } from '@photo-contest/test-kit';

import { createTestApp, TEST_WEB_ORIGIN, type ITestApi, type ITestUser } from '../../test/support/app';
import { createGroup } from '../../test/support/fixtures';
import type { TDatabaseClient } from '../database/database.service';
import { UnitOfWork } from '../database/unit-of-work';
import { MaintenanceService } from '../maintenance/maintenance.service';
import { MediaStorage } from '../storage/media-storage.service';

const COMPLETE = 'mutation($id:ID!){completePostUpload(uploadId:$id){id}}';
describe('업로드 완료 장애 복구', () => {
  let api: ITestApi, owner: ITestUser, groupId: string;
  beforeAll(async () => {
    api = await createTestApp();
    owner = await api.signIn('완료 복구');
    groupId = (await createGroup(api, owner, '완료 복구 그룹')).id;
  });
  afterAll(async () => {
    await api?.close();
  });
  const staged = async () => {
    const body = await createTestImage();
    const { requestPostUpload: ticket } = await api.gqlOk<{
      requestPostUpload: { id: string; url: string; fields: Array<{ name: string; value: string }> };
    }>(
      owner.cookie,
      'mutation($group:ID!,$size:Int!){requestPostUpload(groupId:$group,contentType:"image/png",byteSize:$size){id url fields{name value}}}',
      { group: groupId, size: body.length },
    );
    const request = api.http().post(ticket.url.replace('/backend', '')).set('Origin', TEST_WEB_ORIGIN);
    for (const field of ticket.fields) request.field(field.name, field.value);
    expect((await request.attach('file', body, { filename: 'media', contentType: 'image/png' })).status).toBe(
      201,
    );
    return ticket;
  };
  it('DB 커밋 응답을 잃어도 이미 확정된 파일을 삭제하지 않고 같은 완료 결과를 돌려줘야 한다', async () => {
    const ticket = await staged();
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
      expect(await api.gqlOk(owner.cookie, COMPLETE, { id: ticket.id })).toEqual({
        completePostUpload: { id: ticket.id },
      });
    } finally {
      failure.mockRestore();
    }
    const row = await api.db.postUpload.findUniqueOrThrow({ where: { id: ticket.id } });
    expect(row.storageKey).toBeTruthy();
    expect(await api.app.get(MediaStorage).head(row.storageKey ?? '')).toMatchObject({
      byteSize: row.byteSize,
    });
    expect(await api.db.postUploadAttempt.count({ where: { uploadId: ticket.id } })).toBe(0);
  });
  it('실패한 복사본 삭제도 실패하면 추적을 보존하고 다음 정리에서 게시 파일을 제외해 재시도해야 한다', async () => {
    const ticket = await staged();
    const media = api.app.get(MediaStorage);
    const copy = media.copy.bind(media);
    const originalDelete = media.delete.bind(media);
    let candidate = '';
    const copying = vi.spyOn(media, 'copy').mockImplementation(async (source, destination) => {
      candidate = destination;
      await copy(source, destination);
      throw new Error('Copy response lost');
    });
    const deletion = vi.spyOn(media, 'delete').mockImplementation(async (key) => {
      if (key === candidate) throw new Error('Delete unavailable');
      await originalDelete(key);
    });
    try {
      expect((await api.gqlFail(owner.cookie, COMPLETE, { id: ticket.id })).code).toBe(
        'INTERNAL_SERVER_ERROR',
      );
    } finally {
      copying.mockRestore();
      deletion.mockRestore();
    }
    expect(await api.db.postUploadAttempt.findUnique({ where: { key: candidate } })).not.toBeNull();
    await api.gqlOk(owner.cookie, COMPLETE, { id: ticket.id });
    await api.gqlOk(
      owner.cookie,
      'mutation($group:ID!,$upload:ID!){createPost(groupId:$group,uploadId:$upload,title:"복구 성공",rightsConfirmed:true){id}}',
      { group: groupId, upload: ticket.id },
    );
    const row = await api.db.postUpload.findUniqueOrThrow({ where: { id: ticket.id } });
    expect(row.storageKey).not.toBe(candidate);
    await api.app.get(MaintenanceService).cleanup(new Date(Date.now() + 2 * 60 * 60_000));
    expect(await api.db.postUploadAttempt.findUnique({ where: { key: candidate } })).toBeNull();
    await expect(media.head(candidate)).rejects.toThrow();
    expect(await media.head(row.storageKey ?? '')).toMatchObject({ byteSize: row.byteSize });
  });
});
