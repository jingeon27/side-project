import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

import { createTestImage } from '@photo-contest/test-kit';

import { createTestApp, uploadToStorage, type ITestApi, type ITestUser } from '../../../test/support/app';
import { createGroup } from '../../../test/support/fixtures';
import type { TDatabaseClient } from '../../database/database.service';
import { UnitOfWork } from '../../database/unit-of-work';

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

  it('DB 커밋 응답을 잃어도 저장한 파일을 지우지 않고 다시 완료하면 같은 결과를 돌려줘야 한다', async () => {
    const body = await createTestImage();
    const { requestPostUpload: ticket } = await api.gqlOk<{
      requestPostUpload: { id: string; url: string; fields: Array<{ name: string; value: string }> };
    }>(
      owner.cookie,
      'mutation($group:ID!,$size:Int!){requestPostUpload(groupId:$group,contentType:"image/png",byteSize:$size){id url fields{name value}}}',
      { group: groupId, size: body.length },
    );
    expect((await uploadToStorage(ticket, body, 'image/png')).status).toBe(204);
    const transactions = api.app.get(UnitOfWork);
    const atomic = transactions.atomic.bind(transactions);
    const failure = vi
      .spyOn(transactions, 'atomic')
      .mockImplementationOnce(async <T>(work: (tx: TDatabaseClient) => Promise<T>) => {
        await atomic(work);
        throw new Error('Commit response lost');
      });
    try {
      expect((await api.gqlFail(owner.cookie, COMPLETE, { id: ticket.id })).code).toBe(
        'INTERNAL_SERVER_ERROR',
      );
    } finally {
      failure.mockRestore();
    }
    const row = await api.db.postUpload.findUniqueOrThrow({ where: { id: ticket.id } });
    expect(row).toMatchObject({ stagingKey: null, storageKey: expect.any(String) });
    expect(await api.storage.head(row.storageKey ?? '')).toMatchObject({ byteSize: body.length });
    expect(await api.gqlOk(owner.cookie, COMPLETE, { id: ticket.id })).toEqual({
      completePostUpload: { id: ticket.id },
    });
  });
});
