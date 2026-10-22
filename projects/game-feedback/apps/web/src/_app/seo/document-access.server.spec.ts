import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { ApiError } from '@game-feedback/sdk';

import { documentUnavailable } from './document-access.server';

const { getPost, getPublicProfile, listCategories } = vi.hoisted(() => ({
  getPost: vi.fn(),
  getPublicProfile: vi.fn(),
  listCategories: vi.fn(),
}));
vi.mock('@game-feedback/sdk', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@game-feedback/sdk')>()),
  getPost,
  getPublicProfile,
  listCategories,
}));

const fetchMock = vi.fn();
const notFound = (code: string) => new ApiError(404, code, '찾을 수 없습니다.');

beforeEach(() => {
  vi.stubEnv('GAME_FEEDBACK_API_URL', 'https://api.feedback.example');
  vi.stubGlobal('fetch', fetchMock);
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  vi.resetAllMocks();
});

describe('proxy 문서 접근 판정', () => {
  it('게시글 상세 문서는 반복 요청마다 공개 상세를 다시 받지 않아야 한다', async () => {
    const id = `document-${crypto.randomUUID()}`;
    getPost.mockResolvedValue({ post: { id, author: { id: 'writer' } }, answers: [], comments: [] });
    for (const locale of ['ko', 'en', 'ja'])
      await expect(documentUnavailable(`/${locale}/posts/${id}`)).resolves.toBe(false);
    expect(getPost).toHaveBeenCalledOnce();
    fetchMock.mockResolvedValue(new Response(JSON.stringify({ userIds: ['writer'] }), { status: 200 }));
    await expect(documentUnavailable(`/ko/posts/${id}`, 'test-only-session')).resolves.toBe(true);
    expect(getPost).toHaveBeenCalledOnce();
  });

  it('없는 게시글과 형식이 잘못된 id는 404로 판정한다', async () => {
    getPost.mockRejectedValue(notFound('POST_NOT_FOUND'));
    await expect(documentUnavailable(`/ko/posts/missing-${crypto.randomUUID()}`)).resolves.toBe(true);
    await expect(documentUnavailable('/ko/posts/bad.id')).resolves.toBe(true);
    expect(getPost).toHaveBeenCalledOnce();
  });

  it('프로필은 세션 쿠키로 조회하고 API 장애는 404로 바꾸지 않는다', async () => {
    getPublicProfile.mockResolvedValueOnce({});
    await expect(documentUnavailable('/ko/users/user-1', 'test-only-session')).resolves.toBe(false);
    expect(getPublicProfile).toHaveBeenCalledWith(
      'user-1',
      expect.objectContaining({ headers: { Cookie: 'gamefeedback_session=test-only-session' } }),
    );
    getPublicProfile.mockRejectedValueOnce(notFound('USER_NOT_FOUND'));
    await expect(documentUnavailable('/ko/users/user-1')).resolves.toBe(true);
    getPublicProfile.mockRejectedValueOnce(new ApiError(503, 'UNAVAILABLE', '잠시 후 다시 시도해주세요.'));
    await expect(documentUnavailable('/ko/users/user-1')).resolves.toBe(false);
  });

  it('게시판은 알려진 분류와 활성 게임만 연다', async () => {
    listCategories.mockResolvedValue([
      { slug: 'clash-royale', active: true },
      { slug: 'retired-game', active: false },
    ]);
    await expect(documentUnavailable('/ko/boards/coaching')).resolves.toBe(false);
    await expect(documentUnavailable('/ko/boards/coaching', undefined, ['retired-game'])).resolves.toBe(true);
    await expect(documentUnavailable('/ko/boards/unknown')).resolves.toBe(true);
    await expect(documentUnavailable('/ko/boards/free', undefined, ['a', 'b'])).resolves.toBe(true);
    listCategories.mockRejectedValueOnce(new Error('network down'));
    await expect(documentUnavailable('/ko/boards/free')).resolves.toBe(false);
  });

  it('상세가 아닌 문서는 API를 부르지 않는다', async () => {
    await expect(documentUnavailable('/ko/guide')).resolves.toBe(false);
    expect(getPost).not.toHaveBeenCalled();
    expect(getPublicProfile).not.toHaveBeenCalled();
    expect(listCategories).not.toHaveBeenCalled();
  });
});
