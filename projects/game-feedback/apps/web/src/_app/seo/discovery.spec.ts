import { afterEach, describe, expect, it, vi } from 'vitest';

import { LEGAL_POLICY_VERSION } from '@game-feedback/contracts';

import { robots, sitemap } from './discovery.server';

const { list } = vi.hoisted(() => ({ list: vi.fn() }));
vi.mock('@/features/post/index.server', () => ({ getPublicPostList: list }));
vi.mock('@/features/category/index.server', () => ({
  getPublicCategories: async () => [
    { slug: 'clash-royale', active: true },
    { slug: 'another-game', active: true },
    { slug: 'inactive-game', active: false },
  ],
}));
afterEach(() => {
  vi.unstubAllEnvs();
  list.mockReset();
});
function enable() {
  vi.stubEnv('ENVIRONMENT', 'production');
  vi.stubEnv('WEB_ORIGIN', 'https://feedback.example');
}
const post = (id: string, user = 'author-1', overrides: Record<string, unknown> = {}) => ({
  id,
  board: 'FREE',
  category: { slug: 'clash-royale' },
  author: { id: user, isTestAccount: false },
  updatedAt: '2026-10-17T00:00:00.000Z',
  ...overrides,
});
describe('search discovery', () => {
  it('blocks crawling and avoids data access for alpha and demo environments', async () => {
    vi.stubEnv('ENVIRONMENT', 'development');
    expect(robots().rules).toEqual({ userAgent: '*', disallow: '/' });
    expect(await sitemap()).toEqual([]);
    expect(list).not.toHaveBeenCalled();
  });
  it('walks public post cursors and deduplicates canonical authors without private routes', async () => {
    enable();
    list.mockResolvedValueOnce({ items: [post('first')], nextCursor: 'next' }).mockResolvedValueOnce({
      items: [post('second'), { ...post('test'), author: { id: 'test-user', isTestAccount: true } }],
      nextCursor: null,
    });
    const entries = await sitemap();
    const urls = entries.map((item) => item.url);
    expect(urls).toContain('https://feedback.example/about');
    expect(entries.find((item) => item.url.endsWith('/posts/first'))?.lastModified).toBe(
      '2026-10-17T00:00:00.000Z',
    );
    expect(urls).toContain('https://feedback.example/en/guide');
    expect(urls).toContain('https://feedback.example/ja/terms');
    expect(list.mock.calls.map((call) => call[0])).toEqual([undefined, 'next']);
    expect(urls.filter((url) => url.endsWith('/users/author-1'))).toHaveLength(1);
    expect(urls).toContain('https://feedback.example/ko/posts/second');
    expect(urls).toContain('https://feedback.example/ko/boards/coaching?game=another-game');
    expect(urls).toContain('https://feedback.example/ko/boards/free');
    expect(urls.some((url) => url.includes('inactive-game'))).toBe(false);
    expect(urls.some((url) => /messages|settings|notifications|test-user|posts\/test/.test(url))).toBe(false);
    expect(robots()).toMatchObject({ sitemap: 'https://feedback.example/sitemap.xml' });
  });
  it('dates listings and profiles from their newest post across pages and leaves undated pages blank', async () => {
    enable();
    list
      .mockResolvedValueOnce({
        items: [
          post('newest', 'author-1', { updatedAt: '2026-10-20T00:00:00.000Z' }),
          post('coaching', 'author-2', {
            board: 'COACHING',
            category: { slug: 'another-game' },
            updatedAt: '2026-10-10T00:00:00.000Z',
          }),
        ],
        nextCursor: 'next',
      })
      .mockResolvedValueOnce({
        items: [
          // 뒤 페이지의 오래된 글이 앞 페이지의 최신 시각을 덮지 않아야 한다.
          post('older', 'author-1', { updatedAt: '2026-10-01T00:00:00.000Z' }),
          post('inactive', 'author-3', {
            category: { slug: 'inactive-game' },
            updatedAt: '2026-10-25T00:00:00.000Z',
          }),
          post('test', 'test-user', {
            author: { id: 'test-user', isTestAccount: true },
            updatedAt: '2026-10-30T00:00:00.000Z',
          }),
        ],
        nextCursor: null,
      });
    const entries = await sitemap();
    const lastModifiedOf = (path: string) =>
      entries.find((item) => item.url === `https://feedback.example${path}`)?.lastModified;

    expect(lastModifiedOf('/ko')).toBe('2026-10-25T00:00:00.000Z');
    expect(lastModifiedOf('/ko/users/author-1')).toBe('2026-10-20T00:00:00.000Z');
    expect(lastModifiedOf('/ko/posts/older')).toBe('2026-10-01T00:00:00.000Z');
    expect(lastModifiedOf('/ko/boards/free')).toBe('2026-10-20T00:00:00.000Z');
    expect(lastModifiedOf('/ko/boards/coaching?game=another-game')).toBe('2026-10-10T00:00:00.000Z');
    // 글이 없는 게시판과 수정일 기록이 없는 안내 페이지에는 날짜를 만들지 않는다.
    expect(lastModifiedOf('/ko/boards/feedback')).toBeUndefined();
    for (const path of ['/about', '/ko/guide', '/en/contact']) expect(lastModifiedOf(path)).toBeUndefined();
    for (const path of ['/ko/terms', '/en/privacy', '/ja/terms'])
      expect(lastModifiedOf(path)).toBe(LEGAL_POLICY_VERSION);
    expect(entries.some((item) => item.url.includes('inactive-game'))).toBe(false);
  });
  it('fails visibly instead of returning a silently incomplete sitemap on repeated cursors or API failure', async () => {
    enable();
    list.mockResolvedValue({ items: [], nextCursor: 'same' });
    await expect(sitemap()).rejects.toThrow('did not advance');
    list.mockRejectedValueOnce(new Error('API unavailable'));
    await expect(sitemap()).rejects.toThrow('API unavailable');
  });
});
