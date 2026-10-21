import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

import sharp from 'sharp';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

import { createTestImage } from '@photo-contest/test-kit';

import { createTestApp, TEST_WEB_ORIGIN, type ITestApi, type ITestUser } from '../../test/support/app';
import { createGroup } from '../../test/support/fixtures';
import { SET_MODERATOR } from '../../test/support/group-contest';
import { MaintenanceService } from '../maintenance/maintenance.service';
import { MediaStorage } from '../storage/media-storage.service';

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
  const upload = async (cookie: string | undefined, id = groupId, bytes?: Buffer) => {
    const req = api
      .http()
      .post('/graphql')
      .set('Origin', TEST_WEB_ORIGIN)
      .set('Apollo-Require-Preflight', 'true');
    if (cookie) req.set('Cookie', cookie);
    return req
      .field(
        'operations',
        JSON.stringify({
          query: 'mutation($id:ID!,$file:Upload!){uploadGroupAvatar(groupId:$id,file:$file){id}}',
          variables: { id, file: null },
        }),
      )
      .field('map', JSON.stringify({ '0': ['variables.file'] }))
      .attach('0', bytes ?? (await createTestImage()), { filename: 'avatar.png', contentType: 'image/png' });
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

  it('인증·관리 권한·실제 파일 내용을 확인한 뒤 사진을 준비해야 한다', async () => {
    expect((await upload(undefined)).body.errors[0].extensions.code).toBe('UNAUTHENTICATED');
    expect((await upload(member.cookie)).body.errors[0].extensions.code).toBe('FORBIDDEN');
    expect(
      (await upload(owner.cookie, groupId, Buffer.from('fake png'))).body.errors[0].extensions.code,
    ).toBe('BAD_USER_INPUT');
    const large = Buffer.alloc(10 * 1024 * 1024 + 1);
    expect((await upload(owner.cookie, groupId, large)).body.errors[0].extensions.code).toBe(
      'BAD_USER_INPUT',
    );
  });

  it('실제 이미지를 512px WebP로 정리하고 저장 전에는 공개하지 않으며 다른 그룹의 사진을 거절해야 한다', async () => {
    const image = await sharp({ create: { width: 1024, height: 768, channels: 3, background: '#e85d4a' } })
      .withExif({ IFD0: { Artist: '비공개 EXIF' } })
      .png()
      .toBuffer();
    const response = await upload(moderator.cookie, groupId, image);
    expect(response.body.errors).toBeUndefined();
    const avatarId = response.body.data.uploadGroupAvatar.id as string;
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
    const file = await api.http().get(saved.avatarUrl!.replace('/backend', ''));
    expect(file.status).toBe(200);
    expect(file.headers['content-type']).toContain('image/webp');
    expect(file.headers['cache-control']).toContain('no-store');
    expect(file.headers['x-content-type-options']).toBe('nosniff');
    const metadata = await sharp(file.body as Buffer).metadata();
    expect(metadata).toMatchObject({ format: 'webp', width: 512, height: 384 });
    expect(metadata.exif).toBeUndefined();
    expect((await api.http().get(`/groups/${another.id}/avatar/${avatarId}`)).status).toBe(404);
    expect((await api.gqlFail(owner.cookie, UPDATE, values({ avatarId, removeAvatar: true }))).code).toBe(
      'BAD_USER_INPUT',
    );
    await api.gqlOk(owner.cookie, UPDATE, values({ removeAvatar: true }));
    expect((await api.http().get(saved.avatarUrl!.replace('/backend', ''))).status).toBe(404);
  });

  it('만료 사진을 거절하고 사용 중인 사진은 보존하며 버린 사진은 저장소 실패 후 재시도해야 한다', async () => {
    const active = (await upload(owner.cookie)).body.data.uploadGroupAvatar.id as string;
    const orphan = (await upload(owner.cookie)).body.data.uploadGroupAvatar.id as string;
    const orphanRow = await api.db.groupAvatar.findUniqueOrThrow({ where: { id: orphan } });
    await api.gqlOk(owner.cookie, UPDATE, values({ avatarId: active }));
    await api.db.groupAvatar.updateMany({
      where: { id: { in: [active, orphan] } },
      data: { expiresAt: new Date(0) },
    });
    expect((await api.gqlFail(owner.cookie, UPDATE, values({ avatarId: orphan }))).code).toBe(
      'BAD_USER_INPUT',
    );
    const storage = api.app.get(MediaStorage);
    const failure = vi.spyOn(storage, 'delete').mockRejectedValueOnce(new Error('일시 저장소 오류'));
    await expect(api.app.get(MaintenanceService).cleanup()).rejects.toThrow('일시 저장소 오류');
    expect(await api.db.groupAvatar.findUnique({ where: { id: orphan } })).not.toBeNull();
    failure.mockRestore();
    await api.app.get(MaintenanceService).cleanup();
    expect(await api.db.groupAvatar.findUnique({ where: { id: orphan } })).toBeNull();
    await expect(readFile(join(api.storageDir, orphanRow.storageKey))).rejects.toThrow();
    expect(await api.db.groupAvatar.findUnique({ where: { id: active } })).not.toBeNull();
    const group = (await api.gqlOk<{ group: IProfile }>(undefined, READ, { id: groupId })).group;
    expect((await api.http().get(group.avatarUrl!.replace('/backend', ''))).status).toBe(200);
  });
});
