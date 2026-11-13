import { describe, expect, it, vi } from 'vitest';

import type { SessionRequest } from '../../auth/session/session.types';
import type { CacheInvalidationService } from '../../cache-invalidation/cache-invalidation.service';
import { RequestValidationPipe } from '../../common/http/request-validation';
import { validateMediaHeader } from '../../common/media-file';
import type { UnitOfWork } from '../../database/unit-of-work';
import type { PrismaClient } from '../../generated/prisma';
import type { MediaStorage } from '../../media-storage/media-storage.service';
import type { UsersService } from '../users.service';
import type { UserVisibilityService } from '../visibility/user-visibility.service';
import { UpdateProfileInputSchema, type TUpdateProfileDto } from './profile-input.dto';
import { ProfileService } from './profile.service';

describe('프로필 사진 서명 검사', () => {
  it('PNG로 선언한 SVG·HEIF·AVIF·TIFF 바이트를 거부한다', () => {
    const box = (brand: string) =>
      Buffer.concat([Buffer.from([0, 0, 0, 0x18]), Buffer.from(`ftyp${brand}\0\0\0\0mif1${brand}`)]);
    const disguised = {
      svg: Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="1" height="1"/>'),
      xmlSvg: Buffer.from('<?xml version="1.0"?><svg xmlns="http://www.w3.org/2000/svg"/>'),
      heif: box('heic'),
      avif: box('avif'),
      tiffLittleEndian: Buffer.from([0x49, 0x49, 0x2a, 0x00, 0x08, 0x00, 0x00, 0x00]),
      tiffBigEndian: Buffer.from([0x4d, 0x4d, 0x00, 0x2a, 0x00, 0x00, 0x00, 0x08]),
    };
    for (const [name, bytes] of Object.entries(disguised))
      expect(
        () => validateMediaHeader({ name, mimeType: 'image/png', size: bytes.length, header: bytes }),
        name,
      ).toThrow();
  });
});

/** DB 없이 PATCH /api/profile의 요청 검증과 저장 판단만 본다. 잠금 뒤 읽는 사용자 행과 저장 호출만 가짜다. */
function profileOwner(currentNickname: string) {
  const save = vi.fn(async () => ({}));
  const tx = {
    $queryRaw: vi.fn(async () => []),
    user: {
      findUnique: vi.fn(async () => ({
        id: 'user-1',
        nickname: currentNickname,
        withdrawnAt: null,
        bannedAt: null,
      })),
      update: save,
    },
  };
  const cache = { change: vi.fn(async (work: (client: typeof tx) => Promise<unknown>) => work(tx)) };
  const service = new ProfileService(
    {} as PrismaClient,
    { profile: vi.fn(async () => ({})) } as unknown as UsersService,
    {} as UserVisibilityService,
    {} as MediaStorage,
    {} as UnitOfWork,
    cache as unknown as CacheInvalidationService,
  );
  const req = { gfSession: { user: { id: 'user-1', withdrawnAt: null } } } as unknown as SessionRequest;
  return {
    save,
    // 컨트롤러처럼 본문을 계약으로 먼저 검증한 뒤 서비스에 넘긴다.
    submit: async (body: TUpdateProfileDto) =>
      service.update(
        req,
        await new RequestValidationPipe(UpdateProfileInputSchema).transform(body, { type: 'body' }),
      ),
  };
}

describe('프로필 저장의 예약어 닉네임', () => {
  // 예약어 검사를 닉네임 계약 전체에 걸자, 닉네임을 늘 함께 보내는 프로필 저장이 'badminton' 같은 이름에서도 막혔다.
  it('규칙 전에 정한 예약어 닉네임은 그대로 두고 소개를 저장한다', async () => {
    const owner = profileOwner('관리자');
    await owner.submit({ nickname: '관리자', bio: '새 소개' });
    expect(owner.save).toHaveBeenCalledWith({
      where: { id: 'user-1' },
      data: { nickname: '관리자', bio: '새 소개' },
    });
  });

  it('예약어를 품었을 뿐인 이름은 그대로 저장하거나 새로 고를 수 있다', async () => {
    const kept = profileOwner('badminton');
    await kept.submit({ nickname: 'badminton', bio: '배드민턴도 합니다' });
    expect(kept.save).toHaveBeenCalledOnce();
    const changed = profileOwner('새벽의호그');
    await changed.submit({ nickname: 'badminton', bio: '' });
    expect(changed.save).toHaveBeenCalledWith({
      where: { id: 'user-1' },
      data: { nickname: 'badminton', bio: '' },
    });
  });

  it.each(['운영자', 'Ａｄｍｉｎ', '탈퇴한 사용자'])(
    '닉네임을 %s(으)로 바꾸면 저장하지 않고 400으로 거부한다',
    async (nickname) => {
      const owner = profileOwner('새벽의호그');
      await expect(owner.submit({ nickname, bio: '' })).rejects.toMatchObject({
        status: 400,
        response: {
          errorCode: 'VALIDATION_ERROR',
          message: '운영자나 관리자로 보이는 닉네임은 사용할 수 없어요.',
        },
      });
      expect(owner.save).not.toHaveBeenCalled();
    },
  );
});
