import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { ApiError } from '@game-feedback/sdk';

import { isPostDocumentUnavailable, PublicPostAccessCache } from './post-access.server';

const { getPost } = vi.hoisted(() => ({ getPost: vi.fn() }));
vi.mock('@game-feedback/sdk', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@game-feedback/sdk')>()),
  getPost,
}));

const fetchMock = vi.fn();
const detail = (authorId: string) => ({
  post: { id: 'post', author: { id: authorId } },
  answers: [],
  comments: [],
});
const excludedAuthors = (userIds: string[]) => new Response(JSON.stringify({ userIds }), { status: 200 });
// 모듈 캐시가 테스트 사이에 남으므로 사례마다 새 게시글 id를 쓴다.
const nextId = () => `post-access-${crypto.randomUUID()}`;

beforeEach(() => {
  vi.stubEnv('GAME_FEEDBACK_API_URL', 'https://api.feedback.example');
  vi.stubGlobal('fetch', fetchMock);
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  vi.resetAllMocks();
});

describe('게시글 문서 접근 판정', () => {
  it('비로그인 요청은 공개 조회 결과를 다시 쓰고 차단 관계를 조회하지 않아야 한다', async () => {
    const id = nextId();
    getPost.mockResolvedValue(detail('writer'));
    await expect(isPostDocumentUnavailable(id)).resolves.toBe(false);
    await expect(isPostDocumentUnavailable(id)).resolves.toBe(false);
    expect(getPost).toHaveBeenCalledExactlyOnceWith(
      id,
      expect.not.objectContaining({ headers: expect.anything() }),
    );
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('없는 글은 404로 판정하고 같은 판정을 다시 쓴다', async () => {
    const id = nextId();
    getPost.mockRejectedValue(new ApiError(404, 'POST_NOT_FOUND', '게시글을 찾을 수 없습니다.'));
    await expect(isPostDocumentUnavailable(id)).resolves.toBe(true);
    await expect(isPostDocumentUnavailable(id, 'test-only-session')).resolves.toBe(true);
    expect(getPost).toHaveBeenCalledOnce();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('로그인 요청은 같은 공개 조회에 차단 목록만 세션 쿠키로 더 받아 작성자를 막는다', async () => {
    const id = nextId();
    getPost.mockResolvedValue(detail('writer'));
    fetchMock.mockResolvedValueOnce(excludedAuthors(['writer'])).mockResolvedValueOnce(excludedAuthors([]));
    await expect(isPostDocumentUnavailable(id, 'test-only-session')).resolves.toBe(true);
    await expect(isPostDocumentUnavailable(id, 'other-session')).resolves.toBe(false);
    expect(getPost).toHaveBeenCalledOnce();
    expect(fetchMock).toHaveBeenNthCalledWith(
      1,
      'https://api.feedback.example/_internal/visibility/excluded-authors',
      expect.objectContaining({ headers: { Cookie: 'gamefeedback_session=test-only-session' } }),
    );
    expect(fetchMock).toHaveBeenNthCalledWith(
      2,
      'https://api.feedback.example/_internal/visibility/excluded-authors',
      expect.objectContaining({ headers: { Cookie: 'gamefeedback_session=other-session' } }),
    );
  });

  it('API 장애는 404로 바꾸지 않고 기억하지도 않아야 한다', async () => {
    const id = nextId();
    getPost.mockRejectedValueOnce(new ApiError(503, 'UNAVAILABLE', '잠시 후 다시 시도해주세요.'));
    await expect(isPostDocumentUnavailable(id)).resolves.toBe(false);
    getPost.mockRejectedValueOnce(new ApiError(404, 'POST_NOT_FOUND', '게시글을 찾을 수 없습니다.'));
    await expect(isPostDocumentUnavailable(id)).resolves.toBe(true);
    expect(getPost).toHaveBeenCalledTimes(2);
    getPost.mockResolvedValue(detail('writer'));
    fetchMock.mockResolvedValue(new Response('unavailable', { status: 503 }));
    await expect(isPostDocumentUnavailable(nextId(), 'test-only-session')).resolves.toBe(false);
  });

  it('형식이 잘못된 id는 API를 부르지 않고 404로 판정한다', async () => {
    await expect(isPostDocumentUnavailable('../admin')).resolves.toBe(true);
    await expect(isPostDocumentUnavailable('')).resolves.toBe(true);
    expect(getPost).not.toHaveBeenCalled();
  });
});

describe('공개 조회 결과 캐시', () => {
  it('만료 시간이 지나면 다시 조회하고 동시에 온 요청은 한 번만 조회한다', async () => {
    const clock = { now: 0 };
    const lookup = vi.fn(async (id: string) => ({ authorId: `${id}-writer` }));
    const cache = new PublicPostAccessCache(lookup, { ttlMs: 1_000, maxEntries: 10, now: () => clock.now });
    await Promise.all([cache.get('a'), cache.get('a')]);
    clock.now = 999;
    await cache.get('a');
    expect(lookup).toHaveBeenCalledOnce();
    clock.now = 1_000;
    await expect(cache.get('a')).resolves.toEqual({ authorId: 'a-writer' });
    expect(lookup).toHaveBeenCalledTimes(2);
  });

  it('항목 수를 넘으면 가장 먼저 기억한 글부터 버린다', async () => {
    const lookup = vi.fn<(id: string) => Promise<null>>(async () => null);
    const cache = new PublicPostAccessCache(lookup, { ttlMs: 60_000, maxEntries: 2, now: () => 0 });
    await cache.get('a');
    await cache.get('b');
    await cache.get('c');
    await cache.get('b');
    await cache.get('a');
    expect(lookup.mock.calls.map(([id]) => id)).toEqual(['a', 'b', 'c', 'a']);
  });
});
