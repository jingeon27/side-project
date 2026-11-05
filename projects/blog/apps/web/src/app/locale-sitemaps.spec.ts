import { describe, expect, it } from 'vitest';

import { locales } from '@/i18n/routing';
import { getArticles } from '@/shared/article/lib/get-articles';
import { siteUrl } from '@/shared/config/site';
import { latestModified, localeSitemap } from '@/shared/lib/seo/locale-sitemap';

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

  it('points robots.txt at both locale sitemaps', () => {
    expect(robots().sitemap).toEqual([
      `${siteUrl.origin}/ko/sitemap.xml`,
      `${siteUrl.origin}/en/sitemap.xml`,
    ]);
  });
});
