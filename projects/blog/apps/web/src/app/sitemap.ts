import type { MetadataRoute } from 'next';

import { getArticles, getCategoryLocales, getPublishedCategories } from '@/entities/article/lib/get-articles';
import { locales, type Locale } from '@/i18n/routing';
import { absoluteUrl } from '@/shared/config/site';
import { articleAlternates, articlePath, withDefaultLanguage } from '@/shared/lib/seo/metadata';

export default function sitemap(): MetadataRoute.Sitemap {
  return locales.flatMap((locale) => {
    const articles = getArticles(locale);
    const corePaths: [string, readonly Locale[]][] = [
      ['', locales],
      ['/blog', locales],
      ['/about', locales],
      // Empty categories are not published, so neither listed nor offered as an alternate.
      ...getPublishedCategories(locale).map(
        (category) => [`/blog/category/${category}`, getCategoryLocales(category)] as [string, Locale[]],
      ),
    ];
    const entries: MetadataRoute.Sitemap = corePaths.map(([path, pathLocales]) => ({
      url: absoluteUrl(`/${locale}${path}`),
      alternates: {
        languages: withDefaultLanguage(
          Object.fromEntries(pathLocales.map((value) => [value, absoluteUrl(`/${value}${path}`)])),
        ),
      },
    }));
    for (const tag of new Set(articles.flatMap((article) => article.tags))) {
      entries.push({ url: absoluteUrl(`/${locale}/blog/tag/${encodeURIComponent(tag)}`) });
    }
    return [
      ...entries,
      ...articles.map((article) => ({
        url: absoluteUrl(articlePath(locale, article.slug)),
        lastModified: article.updatedAt || article.publishedAt,
        alternates: { languages: withDefaultLanguage(articleAlternates(article)) },
      })),
    ];
  });
}
