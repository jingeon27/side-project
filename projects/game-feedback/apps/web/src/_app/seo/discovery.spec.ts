import { afterEach, describe, expect, it, vi } from 'vitest';
import { robots, sitemap } from './discovery.server';
const { list } = vi.hoisted(() => ({ list: vi.fn() }));
vi.mock('@/features/post/index.server', () => ({ getPublicPostList: list }));
afterEach(() => {
  vi.unstubAllEnvs();
  list.mockReset();
});
function enable() {
  vi.stubEnv('NODE_ENV', 'production');
  vi.stubEnv('GAME_FEEDBACK_SITE_URL', 'https://feedback.example');
  vi.stubEnv('GAME_FEEDBACK_INDEXING', 'true');
  vi.stubEnv('GF_DEMO_MODE', 'false');
}
const post = (id: string, user = 'author-1') => ({
  id,
  author: { id: user, isTestAccount: false },
  updatedAt: '2026-10-17T00:00:00.000Z',
});
describe('search discovery', () => {
  it('blocks crawling and avoids data access for alpha and demo environments', async () => {
    vi.stubEnv('GAME_FEEDBACK_INDEXING', 'false');
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
    const urls = (await sitemap()).map((item) => item.url);
    expect(list.mock.calls.map((call) => call[0])).toEqual([undefined, 'next']);
    expect(urls.filter((url) => url.endsWith('/users/author-1'))).toHaveLength(1);
    expect(urls).toContain('https://feedback.example/ko/posts/second');
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
