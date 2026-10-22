import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { createTestImage } from '@photo-contest/test-kit';

import { createTestApp, uploadToStorage, type ITestApi, type ITestUser } from '../../test/support/app';
import { createGroup } from '../../test/support/fixtures';
import { MaintenanceService } from '../maintenance/maintenance.service';

const REQUEST =
  'mutation($group:ID!,$size:Int!){requestPostUpload(groupId:$group,contentType:"image/png",byteSize:$size){id url fields{name value}}}';
const COMPLETE = 'mutation($id:ID!){completePostUpload(uploadId:$id){id}}';
const CREATE =
  'mutation($group:ID!,$upload:ID!){createPost(groupId:$group,uploadId:$upload,title:"정책 안 삭제",rightsConfirmed:true){id}}';
const DELETE = 'mutation($id:ID!){deletePost(postId:$id)}';

interface ITicket {
  id: string;
  url: string;
  fields: Array<{ name: string; value: string }>;
}

describe('PostService 삭제 회귀', () => {
  let api: ITestApi;
  let owner: ITestUser;
  let groupId: string;

  beforeAll(async () => {
    api = await createTestApp();
    owner = await api.signIn('정책삭제-작성자');
    groupId = (await createGroup(api, owner, '정책 삭제 그룹')).id;
  });

  afterAll(async () => {
    await api?.close();
  });

  it('POST 정책이 끝나기 전에 지운 게시물의 키에 다시 올린 파일도 정책 만료 뒤에 지워야 한다', async () => {
    // 삭제하면서 업로드 행을 바로 지워, 정책 유효기간 안에 다시 올린 객체가 버킷에 영구히 남았다.
    const body = await createTestImage();
    const { requestPostUpload: ticket } = await api.gqlOk<{ requestPostUpload: ITicket }>(
      owner.cookie,
      REQUEST,
      { group: groupId, size: body.length },
    );
    expect((await uploadToStorage(ticket, body, 'image/png')).status).toBe(204);
    await api.gqlOk(owner.cookie, COMPLETE, { id: ticket.id });
    const { createPost: post } = await api.gqlOk<{ createPost: { id: string } }>(owner.cookie, CREATE, {
      group: groupId,
      upload: ticket.id,
    });
    const { storageKey } = await api.db.postUpload.findUniqueOrThrow({ where: { id: ticket.id } });
    const key = storageKey ?? '';

    expect(await api.gqlOk(owner.cookie, DELETE, { id: post.id })).toEqual({ deletePost: true });
    await expect(api.storage.head(key)).rejects.toThrow();
    const retained = await api.db.postUpload.findUniqueOrThrow({ where: { id: ticket.id } });
    expect(retained.expiresAt.getTime()).toBeLessThanOrEqual(Date.now());
    expect(retained.policyExpiresAt?.getTime()).toBeGreaterThan(Date.now());
    // 지운 업로드는 다시 게시에 쓰지 못한다.
    expect((await api.gqlFail(owner.cookie, CREATE, { group: groupId, upload: ticket.id })).code).toBe(
      'BAD_USER_INPUT',
    );

    expect((await uploadToStorage(ticket, body, 'image/png')).status).toBe(204);
    await api.app.get(MaintenanceService).cleanup();
    expect(await api.storage.head(key)).toMatchObject({ byteSize: body.length });
    expect(await api.db.postUpload.findUnique({ where: { id: ticket.id } })).not.toBeNull();

    await api.app.get(MaintenanceService).cleanup(new Date(Date.now() + 21 * 60_000));
    await expect(api.storage.head(key)).rejects.toThrow();
    expect(await api.db.postUpload.findUnique({ where: { id: ticket.id } })).toBeNull();
  });
});
