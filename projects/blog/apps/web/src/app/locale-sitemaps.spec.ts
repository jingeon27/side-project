import { describe, expect, it } from 'vitest';

import { siteUrl } from '@/shared/config/site';
import { localeSitemap } from '@/shared/lib/seo/locale-sitemap';

import englishSitemap from './en/sitemap';
import koreanSitemap from './ko/sitemap';
import robots from './robots';

describe('locale sitemaps', () => {
  it('serves each locale from its own file', () => {
    expect(koreanSitemap()).toEqual(localeSitemap('ko'));
    expect(englishSitemap()).toEqual(localeSitemap('en'));
  });

  it('points robots.txt at both locale sitemaps', () => {
    expect(robots().sitemap).toEqual([
      `${siteUrl.origin}/ko/sitemap.xml`,
      `${siteUrl.origin}/en/sitemap.xml`,
    ]);
  });
});
