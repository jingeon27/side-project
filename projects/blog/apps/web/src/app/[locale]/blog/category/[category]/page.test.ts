import { describe, expect, it } from 'vitest';

import { getArticles } from '@/entities/article/lib/get-articles';
import { categories } from '@/entities/article/model/categories';

import { generateMetadata, generateStaticParams } from './page';

describe('category pages', () => {
  it('builds only categories that have articles in the locale', () => {
    const expected = (['ko', 'en'] as const).flatMap((locale) =>
      categories
        .filter((category) => getArticles(locale).some((article) => article.category === category))
        .map((category) => ({ locale, category })),
    );
    expect(generateStaticParams()).toEqual(expected);
    expect(expected.length).toBeLessThan(categories.length * 2);
  });

  it('offers hreflang only for locales where the category has articles', async () => {
    for (const { locale, category } of generateStaticParams()) {
      const metadata = await generateMetadata({ params: Promise.resolve({ locale, category }) });
      const locales = (['ko', 'en'] as const).filter((value) =>
        getArticles(value).some((article) => article.category === category),
      );
      const languages = Object.keys(metadata.alternates?.languages ?? {}).filter(
        (key) => key !== 'x-default',
      );
      expect(languages.sort()).toEqual([...locales].sort());
    }
  });
});
