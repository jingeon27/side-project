import { afterEach, describe, expect, it, vi } from 'vitest';
import { resolveSeoConfig, canonicalPath, excerpt } from './config';
import { createPageMetadata, pageContent, staticPageMetadata } from './metadata';
import { serializeJsonLd } from './structured-data';
afterEach(() => vi.unstubAllEnvs());
describe('SEO metadata and visibility', () => {
  const production = {
    NODE_ENV: 'production',
    GAME_FEEDBACK_SITE_URL: 'https://feedback.example',
    GAME_FEEDBACK_INDEXING: 'true',
    GF_DEMO_MODE: 'false',
  };
  it('indexes only explicit production HTTPS sites and excludes demo, previews and local origins', () => {
    expect(resolveSeoConfig(production).indexable).toBe(true);
    for (const overrides of [
      { NODE_ENV: 'development' },
      { GF_DEMO_MODE: 'true' },
      { GAME_FEEDBACK_INDEXING: 'false' },
      { GAME_FEEDBACK_SITE_URL: 'http://feedback.example' },
      { GAME_FEEDBACK_SITE_URL: 'https://localhost' },
    ])
      expect(resolveSeoConfig({ ...production, ...overrides }).indexable).toBe(false);
    expect(() =>
      resolveSeoConfig({ GAME_FEEDBACK_SITE_URL: 'https://user:password@feedback.example/' }),
    ).toThrow();
  });
  it('gives every screen its own title, description, keywords and canonical URL', () => {
    vi.stubEnv('GAME_FEEDBACK_SITE_URL', production.GAME_FEEDBACK_SITE_URL);
    const titles = new Set<string>();
    for (const kind of Object.keys(pageContent) as (keyof typeof pageContent)[]) {
      const metadata = staticPageMetadata(kind, 'ko');
      titles.add(String(metadata.title));
      expect(metadata.description).toBeTruthy();
      expect(metadata.keywords).toContain('클래시 로얄');
      expect(metadata.alternates?.canonical).toMatch(/^https:\/\/feedback\.example\/ko/);
      expect(metadata.twitter).toMatchObject({ card: 'summary_large_image' });
    }
    expect(titles.size).toBe(Object.keys(pageContent).length);
  });
  it('keeps private pages and test identities out of search even when public indexing is enabled', () => {
    for (const [key, value] of Object.entries(production)) vi.stubEnv(key, value);
    expect(createPageMetadata({ title: '공개', description: '공개', path: '/ko' }).robots).toMatchObject({
      index: true,
    });
    for (const kind of ['messages', 'notifications', 'settings'] as const)
      expect(staticPageMetadata(kind, 'ko').robots).toMatchObject({ index: false, follow: false });
    expect(
      createPageMetadata({
        title: '테스트',
        description: '테스트',
        path: '/ko/users/test',
        isTestAccount: true,
      }).robots,
    ).toMatchObject({ index: false });
  });
  it('canonicalizes unfinished translations and preserves meaningful profile pagination', () => {
    vi.stubEnv('GAME_FEEDBACK_SITE_URL', production.GAME_FEEDBACK_SITE_URL);
    expect(canonicalPath('/ja/posts/post-1')).toBe('/ko/posts/post-1');
    expect(
      createPageMetadata({ title: '프로필', description: '프로필', path: '/en/users/user-1?cursor=abc' })
        .alternates?.canonical,
    ).toBe('https://feedback.example/ko/users/user-1?cursor=abc');
  });
  it('escapes JSON-LD script terminators while preserving original content and Unicode', () => {
    const payload = { text: '</script><script>alert("x")</script> 한글 😀 \u2028 \u2029' };
    const serialized = serializeJsonLd(payload);
    expect(serialized).not.toContain('<');
    expect(JSON.parse(serialized)).toEqual(payload);
    expect(excerpt(' 줄바꿈\n  중복  공백 ')).toBe('줄바꿈 중복 공백');
    expect(Array.from(excerpt('😀'.repeat(200))).length).toBe(160);
  });
});
