import { describe, expect, it } from 'vitest';

import { createRss } from './rss';

import type { ArticleSeo } from './metadata';

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
  it('escapes RSS values and includes only the requested language', () => {
    const xml = createRss('ko', [article, { ...article, locale: 'en', title: 'English only' }]);
    expect(xml).toContain('A &lt; B &amp; C');
    expect(xml).not.toContain('English only');
    expect(xml).toContain('Thu, 01 Oct 2026 01:00:00 GMT');
  });
});
