import { expect, test, vi } from 'vitest';

import { createTestApp, type ITestApi, type ITestUser } from '../../../test/support/app';
import { createGroup } from '../../../test/support/fixtures';
import { postUpload } from '../../../test/support/group-contest';
import type { TDatabaseClient } from '../../database/database.service';
import { UnitOfWork } from '../../database/unit-of-work';
import { MaintenanceService } from '../../maintenance/maintenance.service';

const CREATE =
  'mutation($group:ID!,$upload:ID!){createPost(groupId:$group,uploadId:$upload,title:"파일 서비스 검증",rightsConfirmed:true){id}}';
const DELETE = 'mutation($id:ID!){deletePost(postId:$id)}';

interface IFileFixture {
  api: ITestApi;
  owner: ITestUser;
  groupId: string;
  uploadId: string;
  key: string;
  expiresAt: Date;
}

const fileTest = test.extend<{ fixture: IFileFixture }>({
  fixture: async ({ task }, use) => {
    const api = await createTestApp();
    try {
      const label = `파일-${task.id.slice(-8)}`;
      const owner = await api.signIn(label);
      const groupId = (await createGroup(api, owner, label)).id;
      const uploadId = await postUpload(api, owner, groupId);
      const upload = await api.db.postUpload.findUniqueOrThrow({ where: { id: uploadId } });
      if (!upload.storageKey || !upload.expiresAt) throw new Error('Completed upload fixture required.');
      await use({ api, owner, groupId, uploadId, key: upload.storageKey, expiresAt: upload.expiresAt });
    } finally {
      await api.close();
    }
  },
});

async function createPost({ api, owner, groupId, uploadId }: IFileFixture) {
  return (
    await api.gqlOk<{ createPost: { id: string } }>(owner.cookie, CREATE, {
      group: groupId,
      upload: uploadId,
    })
  ).createPost.id;
}

function rejectBeforeCommit(api: ITestApi) {
  const transactions = api.app.get(UnitOfWork);
  const atomic = transactions.atomic.bind(transactions);
  return vi
    .spyOn(transactions, 'atomic')
    .mockImplementationOnce(async <T>(work: (tx: TDatabaseClient) => Promise<T>) => {
      return atomic(async (tx) => {
        await work(tx);
        throw new Error('Simulated failure before commit');
      });
    });
}

fileTest(
  '게시글 저장이 롤백되면 첨부의 만료 변경도 롤백하고 다시 게시할 수 있어야 한다',
  async ({ fixture }) => {
    const { api, owner, groupId, uploadId, expiresAt } = fixture;
    const failure = rejectBeforeCommit(api);
    try {
      expect((await api.gqlFail(owner.cookie, CREATE, { group: groupId, upload: uploadId })).code).toBe(
        'INTERNAL_SERVER_ERROR',
      );
    } finally {
      failure.mockRestore();
    }
    expect(await api.db.post.findUnique({ where: { uploadId } })).toBeNull();
    expect((await api.db.postUpload.findUniqueOrThrow({ where: { id: uploadId } })).expiresAt).toEqual(
      expiresAt,
    );
    const id = await createPost(fixture);
    expect((await api.db.post.findUniqueOrThrow({ where: { id } })).uploadId).toBe(uploadId);
    expect((await api.db.postUpload.findUniqueOrThrow({ where: { id: uploadId } })).expiresAt).toBeNull();
  },
);

fileTest('게시글 삭제가 롤백되면 첨부를 만료시키거나 실제 파일을 지우지 않아야 한다', async ({ fixture }) => {
  const { api, owner, uploadId, key } = fixture;
  const id = await createPost(fixture);
  const failure = rejectBeforeCommit(api);
  try {
    expect((await api.gqlFail(owner.cookie, DELETE, { id })).code).toBe('INTERNAL_SERVER_ERROR');
  } finally {
    failure.mockRestore();
  }
  expect((await api.db.post.findUniqueOrThrow({ where: { id } })).uploadId).toBe(uploadId);
  expect((await api.db.postUpload.findUniqueOrThrow({ where: { id: uploadId } })).expiresAt).toBeNull();
  expect(await api.storage.head(key)).toMatchObject({ contentType: 'image/png' });
});

fileTest(
  '저장소 삭제가 실패해도 게시글 삭제는 완료하고 남은 파일은 유지보수가 다시 정리해야 한다',
  async ({ fixture }) => {
    const { api, owner, uploadId, key } = fixture;
    const id = await createPost(fixture);
    const failure = vi
      .spyOn(api.storage, 'delete')
      .mockRejectedValueOnce(new Error('Temporary storage failure'));
    try {
      expect(await api.gqlOk(owner.cookie, DELETE, { id })).toEqual({ deletePost: true });
    } finally {
      failure.mockRestore();
    }
    expect(await api.db.post.findUnique({ where: { id } })).toBeNull();
    const ticket = await api.db.postUpload.findUniqueOrThrow({ where: { id: uploadId } });
    expect(ticket.expiresAt?.getTime()).toBe(0);
    expect(await api.storage.head(key)).toMatchObject({ contentType: 'image/png' });
    await api.app.get(MaintenanceService).cleanup(new Date(Date.now() + 3 * 60 * 60_000));
    expect(await api.db.postUpload.findUnique({ where: { id: uploadId } })).toBeNull();
    await expect(api.storage.head(key)).rejects.toThrow();
  },
);
