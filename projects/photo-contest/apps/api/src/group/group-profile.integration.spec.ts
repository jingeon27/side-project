import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

import { createTestImage } from '@photo-contest/test-kit';

import {
  createTestApp,
  openStorageRedirect,
  uploadToStorage,
  type ITestApi,
  type ITestUser,
} from '../../test/support/app';
import { createGroup } from '../../test/support/fixtures';
import { SET_MODERATOR } from '../../test/support/group-contest';
import { MaintenanceService } from '../maintenance/maintenance.service';

const FIELDS = 'id name description avatarUrl role canViewPosts members{user{id}}';
const READ = `query($id:ID!){group(id:$id){${FIELDS}}}`;
const UPDATE = `mutation($groupId:ID!,$name:String!,$description:String!,$avatarId:ID,$removeAvatar:Boolean!){updateGroupProfile(groupId:$groupId,name:$name,description:$description,avatarId:$avatarId,removeAvatar:$removeAvatar){${FIELDS}}}`;
interface IProfile {
  id: string;
  name: string;
  description: string;
  avatarUrl: string | null;
  role: string | null;
  canViewPosts: boolean;
  members: unknown[];
}

describe('그룹 사진과 소개', () => {
  let api: ITestApi, owner: ITestUser, member: ITestUser, moderator: ITestUser, groupId: string;
  beforeAll(async () => {
    api = await createTestApp();
    owner = await api.signIn('프로필 관리자');
    member = await api.signIn('프로필 회원');
    moderator = await api.signIn('프로필 부관리자');
    groupId = (await createGroup(api, owner, '그룹 프로필', [member, moderator], 'PRIVATE')).id;
    await api.gqlOk(owner.cookie, SET_MODERATOR, { id: groupId, user: moderator.id, enabled: true });
  });
  afterAll(async () => {
    await api?.close();
  });
  const values = (extra: Record<string, unknown> = {}) => ({
    groupId,
    name: '  새 그룹 이름  ',
    description: '  함께 기록하는 순간\n사진과 영상  ',
    removeAvatar: false,
    ...extra,
  });
  const REQUEST =
    'mutation($groupId:ID!,$type:String!,$size:Int!){requestGroupAvatarUpload(groupId:$groupId,contentType:$type,byteSize:$size){id url fields{name value}}}';
  const COMPLETE = 'mutation($id:ID!){completeGroupAvatarUpload(uploadId:$id){id}}';
  interface ITicket {
    id: string;
    url: string;
    fields: Array<{ name: string; value: string }>;
  }
  const reserve = (cookie: string | undefined, body: Buffer, id = groupId, type = 'image/png') =>
    api.gql<{ requestGroupAvatarUpload: ITicket }>(cookie, REQUEST, { groupId: id, type, size: body.length });
  const store = async (ticket: ITicket, body: Buffer) => {
    expect((await uploadToStorage(ticket, body, 'image/png')).status).toBe(204);
  };
  const upload = async (cookie: string | undefined, id = groupId, bytes?: Buffer) => {
    const image = bytes ?? (await createTestImage());
    const requested = await reserve(cookie, image, id);
    if (!requested.data) return { body: { errors: requested.errors, data: null } };
    const ticket = requested.data.requestGroupAvatarUpload;
    await store(ticket, image);
    return {
      body: await api.gql<{ completeGroupAvatarUpload: { id: string } }>(cookie, COMPLETE, { id: ticket.id }),
    };
  };

  it('관리자·부관리자만 수정하며 공백·글자 수를 검증하고 소개는 생성 때도 지정해야 한다', async () => {
    for (const cookie of [undefined, member.cookie])
      expect((await api.gqlFail(cookie, UPDATE, values())).code).toBe(
        cookie ? 'FORBIDDEN' : 'UNAUTHENTICATED',
      );
    for (const invalid of [
      { name: ' ' },
      { name: '가'.repeat(41) },
      { description: '가'.repeat(501) },
      { avatarId: '' },
    ])
      expect((await api.gqlFail(owner.cookie, UPDATE, values(invalid))).code).toBe('BAD_USER_INPUT');
    expect(
      (await api.gqlOk<{ updateGroupProfile: IProfile }>(moderator.cookie, UPDATE, values()))
        .updateGroupProfile,
    ).toMatchObject({
      name: '새 그룹 이름',
      description: '함께 기록하는 순간\n사진과 영상',
      avatarUrl: null,
    });
    const created = await api.gqlOk<{ createGroup: IProfile }>(
      owner.cookie,
      `mutation{createGroup(name:"소개가 있는 그룹",description:"  첫 소개  "){${FIELDS}}}`,
    );
    expect(created.createGroup.description).toBe('첫 소개');
  });

  it('인증·관리 권한과 사진 형식·크기를 발급 전에 확인해야 한다', async () => {
    expect((await upload(undefined)).body.errors?.[0]?.extensions?.code).toBe('UNAUTHENTICATED');
    expect((await upload(member.cookie)).body.errors?.[0]?.extensions?.code).toBe('FORBIDDEN');
    for (const type of ['video/mp4', 'image/gif'])
      expect(
        (await reserve(owner.cookie, Buffer.from('avatar'), groupId, type)).errors?.[0]?.extensions?.code,
      ).toBe('BAD_USER_INPUT');
    const large = Buffer.alloc(10 * 1024 * 1024 + 1);
    expect((await upload(owner.cookie, groupId, large)).body.errors?.[0]?.extensions?.code).toBe(
      'BAD_USER_INPUT',
    );
  });

  it('올린 사진을 그대로 쓰되 저장 전에는 공개하지 않고 다른 그룹의 사진을 거절해야 한다', async () => {
    const image = await createTestImage({ width: 1024, height: 768 });
    const response = await upload(moderator.cookie, groupId, image);
    expect(response.body.errors).toBeUndefined();
    const avatarId = response.body.data!.completeGroupAvatarUpload.id as string;
    expect(
      (await api.gqlOk<{ group: IProfile }>(undefined, READ, { id: groupId })).group.avatarUrl,
    ).toBeNull();
    const another = await createGroup(api, owner, '다른 그룹');
    expect((await api.gqlFail(owner.cookie, UPDATE, values({ groupId: another.id, avatarId }))).code).toBe(
      'BAD_USER_INPUT',
    );
    const saved = (
      await api.gqlOk<{ updateGroupProfile: IProfile }>(owner.cookie, UPDATE, values({ avatarId }))
    ).updateGroupProfile;
    const anonymous = (await api.gqlOk<{ group: IProfile }>(undefined, READ, { id: groupId })).group;
    expect(anonymous).toMatchObject({
      name: saved.name,
      description: saved.description,
      avatarUrl: saved.avatarUrl,
      role: null,
      canViewPosts: false,
      members: [],
    });
    const file = await openStorageRedirect(await api.http().get(saved.avatarUrl!.replace('/backend', '')));
    expect(file.status).toBe(200);
    expect(file.headers.get('content-type')).toBe('image/png');
    expect(Buffer.from(await file.arrayBuffer())).toEqual(image);
    expect((await api.http().get(`/groups/${another.id}/avatar/${avatarId}`)).status).toBe(404);
    expect((await api.gqlFail(owner.cookie, UPDATE, values({ avatarId, removeAvatar: true }))).code).toBe(
      'BAD_USER_INPUT',
    );
    await api.gqlOk(owner.cookie, UPDATE, values({ removeAvatar: true }));
    expect((await api.http().get(saved.avatarUrl!.replace('/backend', ''))).status).toBe(404);
  });

  it('만료 사진을 거절하고 사용 중인 사진은 보존하며 버린 사진은 저장소 실패 후 재시도해야 한다', async () => {
    const active = (await upload(owner.cookie)).body.data!.completeGroupAvatarUpload.id as string;
    const orphan = (await upload(owner.cookie)).body.data!.completeGroupAvatarUpload.id as string;
    const orphanRow = await api.db.groupAvatar.findUniqueOrThrow({ where: { id: orphan } });
    await api.gqlOk(owner.cookie, UPDATE, values({ avatarId: active }));
    await api.db.groupAvatar.updateMany({
      where: { id: { in: [active, orphan] } },
      data: { expiresAt: new Date(0) },
    });
    expect((await api.gqlFail(owner.cookie, UPDATE, values({ avatarId: orphan }))).code).toBe(
      'BAD_USER_INPUT',
    );
    const failure = vi.spyOn(api.storage, 'delete').mockRejectedValueOnce(new Error('일시 저장소 오류'));
    await api.app.get(MaintenanceService).cleanup();
    expect(await api.db.groupAvatar.findUnique({ where: { id: orphan } })).not.toBeNull();
    failure.mockRestore();
    await api.app.get(MaintenanceService).cleanup();
    expect(await api.db.groupAvatar.findUnique({ where: { id: orphan } })).toBeNull();
    await expect(api.storage.head(orphanRow.storageKey)).rejects.toThrow();
    expect(await api.db.groupAvatar.findUnique({ where: { id: active } })).not.toBeNull();
    const group = (await api.gqlOk<{ group: IProfile }>(undefined, READ, { id: groupId })).group;
    expect((await api.http().get(group.avatarUrl!.replace('/backend', ''))).status).toBe(307);
  });
  it('완료 전 자산·다른 소유자·게시물 티켓으로의 재사용을 거절하고 완료는 재시도해도 같은 사진이어야 한다', async () => {
    const image = await createTestImage();
    const requested = await reserve(owner.cookie, image);
    const ticket = requested.data!.requestGroupAvatarUpload;
    expect((await api.gqlFail(owner.cookie, UPDATE, values({ avatarId: ticket.id }))).code).toBe(
      'BAD_USER_INPUT',
    );
    await store(ticket, image);
    expect((await api.gqlFail(moderator.cookie, COMPLETE, { id: ticket.id })).code).toBe('FORBIDDEN');
    const row = await api.db.groupAvatar.findUniqueOrThrow({ where: { id: ticket.id } });
    expect(
      (
        await api.gqlFail(owner.cookie, 'mutation($id:ID!){completePostUpload(uploadId:$id){id}}', {
          id: row.mediaUploadId,
        })
      ).code,
    ).toBe('FORBIDDEN');
    const first = await api.gqlOk(owner.cookie, COMPLETE, { id: ticket.id });
    expect(await api.gqlOk(owner.cookie, COMPLETE, { id: ticket.id })).toEqual(first);
    expect(
      (
        await api.gqlFail(
          owner.cookie,
          'mutation($group:ID!,$id:ID!){createPost(groupId:$group,uploadId:$id,title:"대표 사진 재사용",rightsConfirmed:true){id}}',
          { group: groupId, id: row.mediaUploadId },
        )
      ).code,
    ).toBe('BAD_USER_INPUT');
  });

  it('파일 확인 도중 관리자 권한을 잃으면 사진을 확정하지 않아야 한다', async () => {
    const image = await createTestImage();
    const ticket = (await reserve(moderator.cookie, image)).data!.requestGroupAvatarUpload;
    await store(ticket, image);
    const head = api.storage.head.bind(api.storage);
    const processing = vi.spyOn(api.storage, 'head').mockImplementation(async (key) => {
      const result = await head(key);
      await api.db.groupMember.update({
        where: { groupId_userId: { groupId, userId: moderator.id } },
        data: { role: 'MEMBER' },
      });
      return result;
    });
    try {
      expect((await api.gqlFail(moderator.cookie, COMPLETE, { id: ticket.id })).code).toBe('FORBIDDEN');
      const asset = await api.db.groupAvatar.findUniqueOrThrow({
        where: { id: ticket.id },
        include: { mediaUpload: true },
      });
      expect(asset.mediaUpload?.storageKey).toBeNull();
    } finally {
      processing.mockRestore();
      await api.db.groupMember.update({
        where: { groupId_userId: { groupId, userId: moderator.id } },
        data: { role: 'MODERATOR' },
      });
    }
  });
  it('그룹 배경 사진은 현재 지정된 사진만 공개하고 사용 중에는 만료 정리에서 보존해야 한다', async () => {
    const response = await upload(owner.cookie);
    const coverId = response.body.data!.completeGroupAvatarUpload.id;
    const update =
      'mutation($groupId:ID!,$name:String!,$description:String!,$coverId:ID,$removeCover:Boolean! = false){updateGroupProfile(groupId:$groupId,name:$name,description:$description,coverId:$coverId,removeCover:$removeCover){id avatarUrl coverUrl}}';
    const endpoint = `/groups/${groupId}/cover/${coverId}`;
    expect((await api.http().get(endpoint)).status).toBe(404);
    expect((await api.gqlFail(member.cookie, update, values({ coverId }))).code).toBe('FORBIDDEN');
    const another = await createGroup(api, owner, '배경 소유권 검증');
    expect((await api.gqlFail(owner.cookie, update, values({ groupId: another.id, coverId }))).code).toBe(
      'BAD_USER_INPUT',
    );
    const { updateGroupProfile: saved } = await api.gqlOk<{ updateGroupProfile: { coverUrl: string } }>(
      owner.cookie,
      update,
      values({ coverId }),
    );
    expect(saved.coverUrl).toBe(`/backend${endpoint}`);
    const publicRead = await api.gqlOk<{ group: { coverUrl: string } }>(
      undefined,
      'query($id:ID!){group(id:$id){coverUrl}}',
      { id: groupId },
    );
    expect(publicRead.group.coverUrl).toBe(saved.coverUrl);
    expect((await api.http().get(endpoint)).status).toBe(307);
    await api.db.groupAvatar.update({ where: { id: coverId }, data: { expiresAt: new Date(0) } });
    await api.app.get(MaintenanceService).cleanup();
    expect(await api.db.groupAvatar.findUnique({ where: { id: coverId } })).not.toBeNull();
    await api.gqlOk(owner.cookie, update, values({ removeCover: true }));
    expect((await api.http().get(endpoint)).status).toBe(404);
    await api.app.get(MaintenanceService).cleanup();
    expect(await api.db.groupAvatar.findUnique({ where: { id: coverId } })).toBeNull();
  });
});
