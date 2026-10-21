import { ApiError } from '@game-feedback/sdk';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
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

const author = (id: string) => ({ author: { id } });
const detail = {
  post: { id: 'post-1', ...author('writer') },
  answers: [
    { id: 'answer-1', ...author('coach') },
    { id: 'answer-2', ...author('blocked') },
  ],
  comments: [
    { id: 'comment-1', ...author('friend') },
    { id: 'comment-2', ...author('blocked') },
  ],
};
const fetchMock = vi.fn();
const excludedAuthors = (userIds: string[]) => new Response(JSON.stringify({ userIds }), { status: 200 });
const signIn = () => getCookie.mockReturnValue({ value: 'test-only-session' });

beforeEach(() => {
  vi.stubEnv('GAME_FEEDBACK_API_URL', 'https://api.feedback.example');
  vi.stubGlobal('fetch', fetchMock);
  getPost.mockResolvedValue(detail);
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  vi.resetAllMocks();
});

describe('게시글 상세 서버 조회', () => {
  it('비로그인 요청은 쿠키 없이 받은 공개 상세를 게시글 id로 캐시하고 차단 관계를 조회하지 않아야 한다', async () => {
    getCookie.mockReturnValue(undefined);
    await expect(getServerPost('post-1')).resolves.toBe(detail);
    expect(getPost).toHaveBeenCalledExactlyOnceWith(
      'post-1',
      expect.not.objectContaining({ headers: expect.anything() }),
    );
    expect(cacheTag).toHaveBeenCalledExactlyOnceWith('posts', 'post:post-1');
    expect(cacheLife).toHaveBeenCalledExactlyOnceWith('max');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('로그인 요청도 같은 공개 캐시를 쓰고 차단 관계만 내부 경로에서 세션 쿠키로 받아야 한다', async () => {
    signIn();
    fetchMock.mockResolvedValue(excludedAuthors([]));
    await expect(getServerPost('post-1')).resolves.toBe(detail);
    expect(getPost).toHaveBeenCalledExactlyOnceWith(
      'post-1',
      expect.not.objectContaining({ headers: expect.anything() }),
    );
    expect(fetchMock).toHaveBeenCalledExactlyOnceWith(
      'https://api.feedback.example/_internal/visibility/excluded-authors',
      expect.objectContaining({ headers: { Cookie: 'gamefeedback_session=test-only-session' } }),
    );
  });

  it('작성자와 차단 관계가 있으면 글을 404로 막아야 한다', async () => {
    signIn();
    fetchMock.mockResolvedValue(excludedAuthors(['writer']));
    await expect(getServerPost('post-1')).rejects.toThrow('NEXT_NOT_FOUND');
  });

  it('차단 관계가 있는 사람의 답변과 댓글은 빼고 돌려줘야 한다', async () => {
    signIn();
    fetchMock.mockResolvedValue(excludedAuthors(['blocked']));
    const visible = await getServerPost('post-1');
    expect(visible.answers.map((answer) => answer.id)).toEqual(['answer-1']);
    expect(visible.comments.map((comment) => comment.id)).toEqual(['comment-1']);
  });

  it('차단 관계를 받지 못하면 걸러지지 않은 상세를 보여주지 않아야 한다', async () => {
    signIn();
    fetchMock.mockResolvedValue(new Response('unavailable', { status: 503 }));
    await expect(getServerPost('post-1')).rejects.toThrow('Excluded authors request failed with 503.');
  });

  it('없는 글은 404, 다른 API 오류는 그대로 전달해야 한다', async () => {
    getCookie.mockReturnValue(undefined);
    getPost.mockRejectedValueOnce(new ApiError(404, 'POST_NOT_FOUND', '게시글을 찾을 수 없습니다.'));
    await expect(getServerPost('missing')).rejects.toThrow('NEXT_NOT_FOUND');
    getPost.mockRejectedValueOnce(new ApiError(503, 'UNAVAILABLE', '잠시 후 다시 시도해주세요.'));
    await expect(getServerPost('post-1')).rejects.toBeInstanceOf(ApiError);
  });

  it('형식이 잘못된 id는 API를 부르지 않아야 한다', async () => {
    await expect(getServerPost('../admin')).rejects.toThrow('NEXT_NOT_FOUND');
    expect(getPost).not.toHaveBeenCalled();
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
