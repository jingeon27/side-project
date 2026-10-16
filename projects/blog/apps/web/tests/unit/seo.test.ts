import { describe, expect, it } from 'vitest';
import sitemap from '@/app/sitemap';
import { GET as rssRoute } from '@/app/rss/[locale]/route';
import { getArticles } from '@/entities/article/lib/get-articles';
import { resolveSiteUrl, siteUrl } from '@/shared/config/site';
import { articleMetadata, pageMetadata, type ArticleSeo } from '@/shared/lib/seo/metadata';
import { createRss } from '@/shared/lib/seo/rss';
import { articleJsonLd, serializeJsonLd } from '@/shared/lib/seo/structured-data';
import ko from '../../messages/ko.json';
import en from '../../messages/en.json';

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
  it('omits hreflang for an unpublished translation', () => {
    expect(
      articleMetadata({ ...article, translations: { ko: article.slug } }).alternates?.languages,
    ).not.toHaveProperty('en');
  });
  it('publishes exactly the existing article URLs in the sitemap', () => {
    const entries = sitemap();
    const actual = entries
      .filter((entry) => /\/(ko|en)\/blog\/[^/]+$/.test(entry.url))
      .map((entry) => entry.url)
      .sort();
    const expected = (['ko', 'en'] as const)
      .flatMap((locale) =>
        getArticles(locale).map(
          (entry) => `${siteUrl.origin}/${locale}/blog/${encodeURIComponent(entry.slug)}`,
        ),
      )
      .sort();
    expect(actual).toEqual(expected);
    for (const locale of ['ko', 'en'] as const)
      for (const article of getArticles(locale)) {
        const entry = entries.find(
          (candidate) =>
            candidate.url === `${siteUrl.origin}/${locale}/blog/${encodeURIComponent(article.slug)}`,
        )!;
        for (const language of ['ko', 'en'] as const) {
          const slug = article.translations[language];
          if (slug)
            expect(entry.alternates?.languages?.[language]).toBe(
              `${siteUrl.origin}/${language}/blog/${encodeURIComponent(slug)}`,
            );
        }
      }
    expect(entries.some((entry) => entry.url.endsWith('/ko/blog/category/engineering'))).toBe(true);
  });
  it('escapes RSS values and includes only the requested language', () => {
    const xml = createRss('ko', [article, { ...article, locale: 'en', title: 'English only' }]);
    expect(xml).toContain('A &lt; B &amp; C');
    expect(xml).not.toContain('English only');
    expect(xml).toContain('Thu, 01 Oct 2026 01:00:00 GMT');
  });
  it('publishes translated English posts in its feed and rejects unsupported feed locales', async () => {
    const response = await rssRoute(new Request('http://localhost/rss/en'), {
      params: Promise.resolve({ locale: 'en' }),
    });
    expect(response.headers.get('content-type')).toContain('application/rss+xml');
    const xml = await response.text();
    const articles = getArticles('en');
    expect(articles.length).toBeGreaterThan(0);
    expect(xml.match(/<item>/g)).toHaveLength(articles.length);
    for (const article of articles)
      expect(xml).toContain(`${siteUrl.origin}/en/blog/${encodeURIComponent(article.slug)}`);
    expect(xml).not.toContain('/ko/blog/');
    expect(
      (await rssRoute(new Request('http://localhost/rss/fr'), { params: Promise.resolve({ locale: 'fr' }) }))
        .status,
    ).toBe(404);
  });
  it('includes structured author, article and breadcrumb data without executable markup', () => {
    const data = articleJsonLd({ ...article, title: '</script><script>alert(1)</script>' });
    expect(data['@graph'].map((entry) => entry['@type'])).toEqual(['BlogPosting', 'BreadcrumbList']);
    const encoded = serializeJsonLd(data);
    expect(encoded).not.toContain('</script>');
    expect(JSON.parse(encoded)['@graph'][0].headline).toContain('</script>');
  });
  it('requires HTTP(S) URLs without credentials and strips URL parameters', () => {
    expect(resolveSiteUrl(undefined).origin).toBe('http://localhost:3100');
    expect(resolveSiteUrl('https://blog.example.com/path?token=secret#hash').href).toBe(
      'https://blog.example.com/',
    );
    expect(() => resolveSiteUrl('javascript:alert(1)')).toThrow();
    expect(() => resolveSiteUrl('https://user:secret@example.com')).toThrow();
  });
});

function keys(value: object, prefix = ''): string[] {
  return Object.entries(value)
    .flatMap(([key, child]) =>
      typeof child === 'object' && child !== null ? keys(child, `${prefix}${key}.`) : [`${prefix}${key}`],
    )
    .sort();
}
it('keeps Korean and English UI message keys aligned', () => {
  expect(keys(ko)).toEqual(keys(en));
});
