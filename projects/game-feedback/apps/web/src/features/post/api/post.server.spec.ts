import { ApiError } from '@game-feedback/sdk';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { getServerPost } from './post.server';

const { getCookie, getPost, cacheTag, cacheLife } = vi.hoisted(() => ({
  getCookie: vi.fn(),
  getPost: vi.fn(),
  cacheTag: vi.fn(),
  cacheLife: vi.fn(),
}));
vi.mock('next/headers', () => ({ cookies: async () => ({ get: getCookie }) }));
vi.mock('next/cache', () => ({ cacheTag, cacheLife }));
vi.mock('next/navigation', () => ({
  notFound: () => {
    throw new Error('NEXT_NOT_FOUND');
  },
}));
vi.mock('@game-feedback/sdk', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@game-feedback/sdk')>()),
  getPost,
}));

const detail = { post: { id: 'post-1' }, answers: [], comments: [] };

afterEach(() => vi.clearAllMocks());

describe('게시글 상세 서버 조회', () => {
  it('비로그인 요청은 쿠키 없이 공개 상세를 받아 게시글 id로 캐시해야 한다', async () => {
    getCookie.mockReturnValue(undefined);
    getPost.mockResolvedValue(detail);
    await expect(getServerPost('post-1')).resolves.toBe(detail);
    expect(getPost).toHaveBeenCalledExactlyOnceWith(
      'post-1',
      expect.not.objectContaining({ headers: expect.anything() }),
    );
    expect(cacheTag).toHaveBeenCalledExactlyOnceWith('post:post-1');
  });

  it('로그인 요청은 차단 관계가 반영되도록 세션 쿠키로 조회하고 캐시하지 않아야 한다', async () => {
    getCookie.mockReturnValue({ value: 'test-only-session' });
    getPost.mockResolvedValue(detail);
    await expect(getServerPost('post-1')).resolves.toBe(detail);
    expect(getPost).toHaveBeenCalledExactlyOnceWith(
      'post-1',
      expect.objectContaining({ headers: { Cookie: 'gamefeedback_session=test-only-session' } }),
    );
    expect(cacheTag).not.toHaveBeenCalled();
  });

  it('비로그인 요청에서 없는 글은 404 화면으로 끝나야 한다', async () => {
    getCookie.mockReturnValue(undefined);
    getPost.mockRejectedValue(new ApiError(404, 'POST_NOT_FOUND', '게시글을 찾을 수 없습니다.'));
    await expect(getServerPost('missing')).rejects.toThrow('NEXT_NOT_FOUND');
  });

  it('비로그인 요청의 다른 API 오류는 404로 바꾸지 않아야 한다', async () => {
    getCookie.mockReturnValue(undefined);
    getPost.mockRejectedValue(new ApiError(503, 'UNAVAILABLE', '잠시 후 다시 시도해주세요.'));
    await expect(getServerPost('post-1')).rejects.toBeInstanceOf(ApiError);
  });

  it('형식이 잘못된 id는 API를 부르지 않아야 한다', async () => {
    await expect(getServerPost('../admin')).rejects.toThrow('NEXT_NOT_FOUND');
    expect(getPost).not.toHaveBeenCalled();
  });
});
