import { describe, expect, it } from 'vitest';

import { getArticles } from '@/entities/article/lib/get-articles';
import { siteUrl } from '@/shared/config/site';

import { GET as rssRoute } from './route';

describe('multilingual SEO', () => {
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
});
