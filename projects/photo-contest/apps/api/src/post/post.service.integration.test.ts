import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { createTestImage } from '@photo-contest/test-kit';

import { createTestApp, uploadToStorage, type ITestApi, type ITestUser } from '../../test/support/app';
import { createGroup } from '../../test/support/fixtures';
import { createEntry, createGroupContest } from '../../test/support/group-contest';
import { MaintenanceService } from '../maintenance/maintenance.service';

const REQUEST =
  'mutation($group:ID!,$size:Int!){requestPostUpload(groupId:$group,contentType:"image/png",byteSize:$size){id url fields{name value}}}';
const COMPLETE = 'mutation($id:ID!){completePostUpload(uploadId:$id){id}}';
const CREATE =
  'mutation($group:ID!,$upload:ID!){createPost(groupId:$group,uploadId:$upload,title:"정책 안 삭제",rightsConfirmed:true){id}}';
const DELETE = 'mutation($id:ID!){deletePost(postId:$id)}';
const LIKE = 'mutation($id:ID!){likePost(postId:$id){id likedByMe}}';
const HIDE = 'mutation($id:ID!,$hidden:Boolean!){setPostHidden(postId:$id,hidden:$hidden)}';

interface ITicket {
  id: string;
  url: string;
  fields: Array<{ name: string; value: string }>;
}

describe('PostService 회귀', () => {
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

  it('좋아요한 대회 작품이 숨겨져도 그 대회의 좋아요 한도가 잠기지 않아야 한다', async () => {
    // 한도 집계에 숨긴 작품이 섞였는데 숨긴 작품은 목록에 없어 취소할 수도 없었다.
    const member = await api.signIn('정책삭제-좋아요 회원');
    const group = await createGroup(api, owner, '좋아요 잠김 그룹', [member]);
    const contestId = await createGroupContest(api, owner, group.id, '좋아요 잠김 대회');
    const first = await createEntry(api, owner, group.id, contestId);
    const second = await createEntry(api, owner, group.id, contestId);
    await api.gqlOk(member.cookie, LIKE, { id: first.id });
    expect((await api.gqlFail(member.cookie, LIKE, { id: second.id })).message).toContain('1개 작품까지만');

    await api.gqlOk(owner.cookie, HIDE, { id: first.id, hidden: true });
    const { likePost } = await api.gqlOk<{ likePost: { likedByMe: boolean } }>(member.cookie, LIKE, {
      id: second.id,
    });
    expect(likePost.likedByMe).toBe(true);
    expect(
      await api.db.postLike.count({ where: { userId: member.id, post: { contestId, hidden: false } } }),
    ).toBe(1);
  });

  it('같은 업로드로 다시 보낸 게시 요청은 새 글 없이 처음 만든 게시물을 돌려줘야 한다', async () => {
    // 응답을 놓친 재시도가 Post.uploadId unique에 걸려 '이미 제출하거나 투표했습니다.'로 실패했다.
    const body = await createTestImage();
    const { requestPostUpload: ticket } = await api.gqlOk<{ requestPostUpload: ITicket }>(
      owner.cookie,
      REQUEST,
      { group: groupId, size: body.length },
    );
    expect((await uploadToStorage(ticket, body, 'image/png')).status).toBe(204);
    await api.gqlOk(owner.cookie, COMPLETE, { id: ticket.id });
    const variables = { group: groupId, upload: ticket.id };

    const results = await Promise.all(
      Array.from({ length: 4 }, () =>
        api.gqlOk<{ createPost: { id: string } }>(owner.cookie, CREATE, variables),
      ),
    );
    const ids = new Set(results.map(({ createPost }) => createPost.id));
    expect(ids.size).toBe(1);
    const [postId = ''] = ids;
    expect(
      (await api.gqlOk<{ createPost: { id: string } }>(owner.cookie, CREATE, variables)).createPost.id,
    ).toBe(postId);
    expect(await api.db.post.count({ where: { uploadId: ticket.id } })).toBe(1);
    expect(await api.db.analyticsEvent.count({ where: { id: `post:${postId}` } })).toBe(1);

    // 다른 사람은 남의 업로드로 글을 만들거나 그 글을 받아 가지 못한다.
    const other = await api.signIn('정책삭제-다른 회원');
    await api.gqlOk(other.cookie, 'mutation($id:ID!){requestGroupMembership(groupId:$id){id}}', {
      id: groupId,
    });
    expect(await api.gqlFail(other.cookie, CREATE, variables)).toEqual({
      code: 'CONFLICT',
      message: '이미 다른 곳에 사용한 업로드입니다. 파일을 다시 올려 주세요.',
    });
  });
});
