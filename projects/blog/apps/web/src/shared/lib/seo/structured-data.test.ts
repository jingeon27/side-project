import { describe, expect, it } from 'vitest';

import { articleJsonLd, serializeJsonLd } from './structured-data';

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
  it('includes structured author, article and breadcrumb data without executable markup', () => {
    const data = articleJsonLd({ ...article, title: '</script><script>alert(1)</script>' });
    expect(data['@graph'].map((entry) => entry['@type'])).toEqual(['BlogPosting', 'BreadcrumbList']);
    const encoded = serializeJsonLd(data);
    expect(encoded).not.toContain('</script>');
    expect(JSON.parse(encoded)['@graph'][0].headline).toContain('</script>');
  });
});
