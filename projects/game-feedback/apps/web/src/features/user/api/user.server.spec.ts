import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { ApiError } from '@game-feedback/sdk';

import { getPublicServerProfile } from './user.server';

const { getPublicProfile } = vi.hoisted(() => ({ getPublicProfile: vi.fn() }));
vi.mock('next/headers', () => ({
  cookies: async () => ({ get: () => ({ value: 'test-only-session' }) }),
  headers: async () => ({ get: () => '203.0.113.7' }),
}));
vi.mock('@game-feedback/sdk', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@game-feedback/sdk')>()),
  getPublicProfile,
}));

beforeEach(() => vi.stubEnv('GAME_FEEDBACK_API_URL', 'https://api.feedback.example'));
afterEach(() => {
  vi.unstubAllEnvs();
  vi.resetAllMocks();
});

describe('공유 이미지용 공개 프로필 조회', () => {
  it('로그인한 요청이어도 세션 쿠키 없이 읽는다', async () => {
    const profile = { author: { id: 'user-1' } };
    getPublicProfile.mockResolvedValue(profile);
    await expect(getPublicServerProfile('user-1')).resolves.toBe(profile);
    expect(getPublicProfile).toHaveBeenCalledExactlyOnceWith(
      'user-1',
      expect.objectContaining({
        baseUrl: 'https://api.feedback.example',
        headers: expect.not.objectContaining({ Cookie: expect.anything() }),
      }),
    );
  });

  it('없는 사용자는 null이고 다른 API 오류는 그대로 전달한다', async () => {
    getPublicProfile.mockRejectedValueOnce(new ApiError(404, 'USER_NOT_FOUND', '사용자를 찾을 수 없습니다.'));
    await expect(getPublicServerProfile('missing')).resolves.toBeNull();
    getPublicProfile.mockRejectedValueOnce(new ApiError(429, 'RATE_LIMITED', '요청이 많습니다.'));
    await expect(getPublicServerProfile('user-1')).rejects.toBeInstanceOf(ApiError);
  });
});
