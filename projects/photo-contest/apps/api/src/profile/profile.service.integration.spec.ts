import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { createTestImage } from '@photo-contest/test-kit';

import { createTestApp, uploadToStorage, type ITestApi, type ITestUser } from '../../test/support/app';
import { ERROR_MESSAGE } from '../common/errors';
import { UPLOAD_TICKET_TTL_MS } from '../config/limits';

const REQUEST =
  'mutation($contentType:String!,$byteSize:Int!){requestProfileAvatarUpload(contentType:$contentType,byteSize:$byteSize){id url fields{name value}}}';
const COMPLETE = 'mutation($uploadId:ID!){completeProfileAvatarUpload(uploadId:$uploadId){id}}';
const UPDATE =
  'mutation($nickname:String!,$avatarId:ID,$removeAvatar:Boolean){updateMyProfile(nickname:$nickname,avatarId:$avatarId,removeAvatar:$removeAvatar){id nickname avatar}}';
const ONBOARD =
  'mutation($nickname:String!,$removeAvatar:Boolean,$acceptedTerms:Boolean!){completeOnboarding(nickname:$nickname,removeAvatar:$removeAvatar,acceptedTerms:$acceptedTerms){id nickname avatar needsOnboarding}}';
interface ITicket {
  id: string;
  url: string;
  fields: { name: string; value: string }[];
}

describe('프로필 사진과 가입 설정', () => {
  let api: ITestApi, owner: ITestUser, other: ITestUser;
  beforeAll(async () => {
    api = await createTestApp();
    owner = await api.signIn('프로필소유자');
    other = await api.signIn('프로필다른회원');
  });
  afterAll(async () => {
    await api?.close();
  });
  const ticket = async (body: Uint8Array) =>
    (
      await api.gqlOk<{ requestProfileAvatarUpload: ITicket }>(owner.cookie, REQUEST, {
        contentType: 'image/png',
        byteSize: body.byteLength,
      })
    ).requestProfileAvatarUpload;

  it('브라우저가 S3에 직접 올린 사진만 HEAD 확인 후 적용하고 조회 때 짧은 서명 URL로 보내야 한다', async () => {
    const body = await createTestImage();
    const upload = await ticket(body);
    const previous = await api.db.user.findUniqueOrThrow({
      where: { id: owner.id },
      select: { avatarUploadId: true },
    });
    // ListBucket 권한이 없는 AWS HEAD는 미전송 객체도 403이라 원인을 확정할 수 없어 서버 오류로 보고한다.
    expect([
      { code: 'BAD_USER_INPUT', message: '파일 전송을 완료한 뒤 다시 시도해 주세요.' },
      { code: 'INTERNAL_SERVER_ERROR', message: ERROR_MESSAGE.INTERNAL },
    ]).toContainEqual(await api.gqlFail(owner.cookie, COMPLETE, { uploadId: upload.id }));
    expect(await api.db.profileUpload.findUniqueOrThrow({ where: { id: upload.id } })).toMatchObject({
      completedAt: null,
    });
    expect(
      await api.db.user.findUniqueOrThrow({ where: { id: owner.id }, select: { avatarUploadId: true } }),
    ).toEqual(previous);
    expect(
      (await api.gqlFail(owner.cookie, UPDATE, { nickname: owner.nickname, avatarId: upload.id })).code,
    ).toBe('FORBIDDEN');
    expect((await api.gqlFail(other.cookie, COMPLETE, { uploadId: upload.id })).code).toBe('FORBIDDEN');
    expect((await uploadToStorage(upload, body, 'image/png')).ok).toBe(true);
    await api.gqlOk(owner.cookie, COMPLETE, { uploadId: upload.id });
    const result = await api.gqlOk<{ updateMyProfile: { avatar: string } }>(owner.cookie, UPDATE, {
      nickname: ' 새 닉네임 ',
      avatarId: upload.id,
    });
    const path = result.updateMyProfile.avatar.replace('/backend', '');
    const response = await api.http().get(path);
    expect(response.status).toBe(307);
    expect(response.headers['cache-control']).toBe('private, no-store');
    expect(response.headers.location).toContain('X-Amz-Expires=60');
    expect((await fetch(String(response.headers.location))).status).toBe(200);
    expect(
      (await api.gqlFail(other.cookie, UPDATE, { nickname: '다른회원', avatarId: upload.id })).code,
    ).toBe('FORBIDDEN');
    const expired = new Date(Date.now() - UPLOAD_TICKET_TTL_MS * 2);
    await api.db.profileUpload.update({
      where: { id: upload.id },
      data: { expiresAt: expired, policyExpiresAt: expired },
    });
    await api.runScheduledWork();
    expect((await api.http().get(path)).status).toBe(307);
    await api.gqlOk(owner.cookie, UPDATE, { nickname: '새 닉네임', removeAvatar: true });
    expect((await api.http().get(path)).status).toBe(404);
  });

  it('미완료·만료·다른 크기와 형식의 파일 및 잘못된 DTO를 거절해야 한다', async () => {
    for (const values of [
      { contentType: 'video/mp4', byteSize: 20 },
      { contentType: 'image/png', byteSize: 0 },
      { contentType: 'image/png', byteSize: 10 * 1024 * 1024 + 1 },
    ])
      expect((await api.gqlFail(owner.cookie, REQUEST, values)).code).toBe('BAD_USER_INPUT');
    const body = await createTestImage();
    const upload = await ticket(body);
    expect((await api.gqlFail(owner.cookie, UPDATE, { nickname: '소유자', avatarId: upload.id })).code).toBe(
      'FORBIDDEN',
    );
    await api.db.profileUpload.update({
      where: { id: upload.id },
      data: { expiresAt: new Date(Date.now() - 1) },
    });
    expect((await api.gqlFail(owner.cookie, COMPLETE, { uploadId: upload.id })).code).toBe('FORBIDDEN');
  });

  it('사용하지 않는 만료 S3 파일은 정리하고 현재 프로필 파일은 보존해야 한다', async () => {
    const body = await createTestImage();
    const upload = await ticket(body);
    await uploadToStorage(upload, body, 'image/png');
    const row = await api.db.profileUpload.findUniqueOrThrow({ where: { id: upload.id } });
    const past = new Date(Date.now() - UPLOAD_TICKET_TTL_MS * 2);
    await api.db.profileUpload.update({
      where: { id: upload.id },
      data: { expiresAt: past, policyExpiresAt: past },
    });
    await api.runScheduledWork();
    expect(await api.db.profileUpload.findUnique({ where: { id: upload.id } })).toBeNull();
    await expect(api.storage.head(row.storageKey)).rejects.toThrow();
  });

  it('기존 이름·사진을 기본값으로 주고 약관 동의와 수정·제거를 확정해야 한다', async () => {
    const user = await api.signIn('가입완료전');
    await api.db.user.update({
      where: { id: user.id },
      data: { needsOnboarding: true, nickname: '기존 이름', avatar: 'https://provider.example/profile.jpg' },
    });
    expect(await api.gqlOk(user.cookie, '{me{nickname avatar needsOnboarding}}')).toEqual({
      me: { nickname: '기존 이름', avatar: 'https://provider.example/profile.jpg', needsOnboarding: true },
    });
    expect((await api.gqlFail(user.cookie, 'mutation{createGroup(name:"가입전 금지"){id}}')).code).toBe(
      'FORBIDDEN',
    );
    expect(
      (await api.gqlFail(user.cookie, ONBOARD, { nickname: '직접 설정', acceptedTerms: false })).code,
    ).toBe('BAD_USER_INPUT');
    const done = await api.gqlOk(user.cookie, ONBOARD, {
      nickname: ' 직접 설정 ',
      removeAvatar: true,
      acceptedTerms: true,
    });
    expect(done).toEqual({
      completeOnboarding: { id: user.id, nickname: '직접 설정', avatar: null, needsOnboarding: false },
    });
    const saved = await api.db.user.findUniqueOrThrow({ where: { id: user.id } });
    expect(saved.termsAcceptedAt).toBeInstanceOf(Date);
    expect(saved.termsVersion).toBe('2026-10-22');
    expect(saved.avatar).toBeNull();
    await api.gqlOk(user.cookie, 'mutation{createGroup(name:"가입완료"){id}}');
  });
});
