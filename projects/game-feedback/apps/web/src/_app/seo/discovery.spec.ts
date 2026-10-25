import { afterEach, describe, expect, it, vi } from 'vitest';

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
  vi.stubEnv('GAME_FEEDBACK_SITE_URL', 'https://feedback.example');
  vi.stubEnv('GF_DEMO_MODE', 'false');
}
const post = (id: string, user = 'author-1') => ({
  id,
  author: { id: user, isTestAccount: false },
  updatedAt: '2026-10-17T00:00:00.000Z',
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
  it('fails visibly instead of returning a silently incomplete sitemap on repeated cursors or API failure', async () => {
    enable();
    list.mockResolvedValue({ items: [], nextCursor: 'same' });
    await expect(sitemap()).rejects.toThrow('did not advance');
    list.mockRejectedValueOnce(new Error('API unavailable'));
    await expect(sitemap()).rejects.toThrow('API unavailable');
  });
});
