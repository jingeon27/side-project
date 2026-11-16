import { describe, expect, it } from 'vitest';

import { locales } from '@/i18n/routing';
import { getArticles, getPublishedCategories } from '@/shared/article/lib/get-articles';
import { siteUrl } from '@/shared/config/site';
import { latestModified, localeSitemap } from '@/shared/lib/seo/locale-sitemap';

import { generateMetadata as categoryMetadata } from './[locale]/blog/category/[category]/page';
import englishSitemap from './en/sitemap';
import koreanSitemap from './ko/sitemap';
import robots from './robots';
import { GET } from './sitemap.xml/route';

describe('locale sitemaps', () => {
  it('serves each locale from its own file', () => {
    expect(koreanSitemap()).toEqual(localeSitemap('ko'));
    expect(englishSitemap()).toEqual(localeSitemap('en'));
  });

  it('serves an index at the conventional address that points at both locale files', async () => {
    const response = GET();
    const body = await response.text();
    expect(response.headers.get('content-type')).toContain('application/xml');
    expect(body).toContain('<sitemapindex ');
    for (const locale of locales)
      expect(body).toContain(
        `<sitemap><loc>${siteUrl.origin}/${locale}/sitemap.xml</loc><lastmod>${latestModified(getArticles(locale))}</lastmod></sitemap>`,
      );
  });

  it('offers category hreflang in the head only for categories the sitemaps list', async () => {
    const urls = new Set(locales.flatMap((locale) => localeSitemap(locale).map((entry) => entry.url)));
    for (const locale of locales)
      for (const category of getPublishedCategories(locale)) {
        const metadata = await categoryMetadata({ params: Promise.resolve({ locale, category }) });
        for (const alternate of Object.values(metadata.alternates?.languages ?? {}))
          expect(urls.has(String(alternate)), String(alternate)).toBe(true);
      }
  });

  it('points robots.txt at both locale sitemaps', () => {
    expect(robots().sitemap).toEqual([
      `${siteUrl.origin}/ko/sitemap.xml`,
      `${siteUrl.origin}/en/sitemap.xml`,
    ]);
  });
});
