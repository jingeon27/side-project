import { randomUUID } from 'node:crypto';

import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { createTestApp, type ITestApi, type ITestUser } from '../../test/support/app';
import { createGroup } from '../../test/support/fixtures';
import { ANONYMOUS_STORAGE_QUOTA_BYTES, USER_STORAGE_QUOTA_BYTES } from '../config/limits';
import { ANONYMOUS_STORAGE_QUOTA_EXCEEDED, STORAGE_QUOTA_EXCEEDED } from './storage-quota';

const REQUEST =
  'mutation($group:ID!,$type:String!,$size:Int!){requestPostUpload(groupId:$group,contentType:$type,byteSize:$size){id}}';
// PostUpload.byteSize는 Int라 이미 맡긴 큰 용량은 여러 행으로 나눠 채운다.
const FILLER_BYTES = 1_000_000_000;
const LEFT_BYTES = 50 * 1024 * 1024;

describe('사용자별 저장 용량 상한', () => {
  let api: ITestApi;
  let owner: ITestUser;
  let groupId: string;

  beforeAll(async () => {
    api = await createTestApp();
    owner = await api.signIn('저장용량-회원');
    groupId = (await createGroup(api, owner, '저장 용량 그룹')).id;
  });

  afterAll(async () => {
    await api?.close();
  });

  it('지금까지 맡긴 원본과 새 파일의 합이 상한을 넘으면 발급하지 않아야 한다', async () => {
    const used = USER_STORAGE_QUOTA_BYTES - LEFT_BYTES;
    const fillers = Math.floor(used / FILLER_BYTES);
    const sizes = [...Array.from({ length: fillers }, () => FILLER_BYTES), used - fillers * FILLER_BYTES];
    // 만료된 행이라 대기 중 발급 한도에는 섞이지 않지만 정리되기 전까지 용량에는 센다.
    await api.db.postUpload.createMany({
      data: sizes.map((byteSize) => ({
        userId: owner.id,
        groupId,
        tokenHash: randomUUID(),
        expiresAt: new Date(0),
        kind: 'VIDEO',
        contentType: 'video/mp4',
        byteSize,
      })),
    });
    expect(
      await api.gqlFail(owner.cookie, REQUEST, { group: groupId, type: 'video/mp4', size: LEFT_BYTES + 1 }),
    ).toEqual({ code: 'RATE_LIMITED', message: STORAGE_QUOTA_EXCEEDED });
    const { requestPostUpload } = await api.gqlOk<{ requestPostUpload: { id: string } }>(
      owner.cookie,
      REQUEST,
      { group: groupId, type: 'video/mp4', size: LEFT_BYTES },
    );
    expect(requestPostUpload.id).toEqual(expect.any(String));
  });

  it('익명 계정은 더 작은 한도까지만 발급하고 회원으로 가입하라고 안내해야 한다', async () => {
    const anonymous = await api.signIn('저장용량-익명', { anonymous: true });
    await api.gqlOk(anonymous.cookie, 'mutation($id:ID!){requestGroupMembership(groupId:$id){id}}', {
      id: groupId,
    });
    await api.db.postUpload.create({
      data: {
        userId: anonymous.id,
        groupId,
        tokenHash: randomUUID(),
        expiresAt: new Date(0),
        kind: 'VIDEO',
        contentType: 'video/mp4',
        byteSize: ANONYMOUS_STORAGE_QUOTA_BYTES - LEFT_BYTES,
      },
    });
    expect(
      await api.gqlFail(anonymous.cookie, REQUEST, {
        group: groupId,
        type: 'video/mp4',
        size: LEFT_BYTES + 1,
      }),
    ).toEqual({ code: 'RATE_LIMITED', message: ANONYMOUS_STORAGE_QUOTA_EXCEEDED });
    expect(
      (
        await api.gqlOk<{ requestPostUpload: { id: string } }>(anonymous.cookie, REQUEST, {
          group: groupId,
          type: 'video/mp4',
          size: LEFT_BYTES,
        })
      ).requestPostUpload.id,
    ).toEqual(expect.any(String));
    // 프로필 사진도 같은 합계·한도를 쓴다.
    expect(
      await api.gqlFail(
        anonymous.cookie,
        'mutation($size:Int!){requestProfileAvatarUpload(contentType:"image/png",byteSize:$size){id}}',
        { size: 1 },
      ),
    ).toEqual({ code: 'RATE_LIMITED', message: ANONYMOUS_STORAGE_QUOTA_EXCEEDED });
  });
});
