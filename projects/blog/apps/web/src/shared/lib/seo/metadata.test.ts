import { describe, expect, it } from 'vitest';

import { siteUrl } from '@/shared/config/site';
import { articleMetadata, pageMetadata, type ArticleSeo } from '@/shared/lib/seo/metadata';

const article: ArticleSeo = {
  id: 'cache',
  locale: 'ko',
  title: '캐시 설계',
  slug: '캐시-설계',
  description: 'A < B & C',
  keywords: ['cache'],
  category: 'engineering',
  tags: ['nextjs'],
  publishedAt: '2026-10-01T10:00:00+09:00',
  translations: { ko: '캐시-설계', en: 'designing-cache' },
};

describe('multilingual SEO', () => {
  it('generates self canonical pages and genuine language alternatives', () => {
    const meta = pageMetadata('en', 'about');
    expect(meta.alternates?.canonical).toBe(`${siteUrl.origin}/en/about`);
    expect(meta.alternates?.languages).toEqual({
      ko: `${siteUrl.origin}/ko/about`,
      en: `${siteUrl.origin}/en/about`,
      'x-default': `${siteUrl.origin}/ko/about`,
    });
    expect(meta.description).toBeTruthy();
    expect(meta.keywords?.length).toBeGreaterThan(0);
  });

  it('uses content translations rather than reusing the current slug for hreflang', () => {
    const meta = articleMetadata(article);
    expect(meta.alternates?.canonical).toBe(`${siteUrl.origin}/ko/blog/${encodeURIComponent('캐시-설계')}`);
    expect(meta.alternates?.languages?.en).toBe(`${siteUrl.origin}/en/blog/designing-cache`);
    expect(meta.openGraph).toMatchObject({
      type: 'article',
      title: '캐시 설계',
      publishedTime: article.publishedAt,
    });
    expect(meta.twitter).toMatchObject({ card: 'summary_large_image' });
  });

  it('keeps the RSS alternate and points x-default to the Korean version on article pages', () => {
    const meta = articleMetadata({ ...article, locale: 'en', slug: 'designing-cache' });
    expect(meta.alternates?.canonical).toBe(`${siteUrl.origin}/en/blog/designing-cache`);
    expect(meta.alternates?.types).toEqual({ 'application/rss+xml': `${siteUrl.origin}/rss/en` });
    expect(meta.alternates?.languages).toMatchObject({
      'x-default': `${siteUrl.origin}/ko/blog/${encodeURIComponent('캐시-설계')}`,
    });
  });

  it('omits x-default when a page has no other language version', () => {
    expect(articleMetadata({ ...article, translations: { ko: article.slug } }).alternates?.languages).toEqual(
      { ko: `${siteUrl.origin}/ko/blog/${encodeURIComponent('캐시-설계')}` },
    );
    expect(pageMetadata('ko', 'blog', '/blog/tag/nextjs').alternates?.languages).not.toHaveProperty(
      'x-default',
    );
  });

  it('omits hreflang for an unpublished translation', () => {
    expect(
      articleMetadata({ ...article, translations: { ko: article.slug } }).alternates?.languages,
    ).not.toHaveProperty('en');
  });
});
