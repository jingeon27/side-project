import { describe, expect, it } from 'vitest';

import { getArticles, getIndexedTags } from '@/shared/article/lib/get-articles';

import { generateMetadata, generateStaticParams } from './page';

describe('tag pages', () => {
  it('indexes a tag only when it lists more than one article', async () => {
    for (const { locale, tag } of generateStaticParams()) {
      const metadata = await generateMetadata({ params: Promise.resolve({ locale, tag }) });
      const count = getArticles(locale).filter((article) => article.tags.includes(tag)).length;
      expect(metadata.robots, `${locale}/${tag}`).toEqual({ index: count > 1, follow: true });
    }
  });

  it('keeps single-article tag pages published so article links still work', () => {
    for (const locale of ['ko', 'en'] as const) {
      const published = generateStaticParams().filter((params) => params.locale === locale);
      expect(published.length).toBeGreaterThan(getIndexedTags(locale).length);
    }
  });
});
