import type { MetadataRoute } from 'next';
import { getArticles } from '@/entities/article/lib/get-articles';
import { locales } from '@/i18n/routing';
import { absoluteUrl } from '@/shared/config/site';
import { articleAlternates, articlePath } from '@/shared/lib/seo/metadata';

const categories = ['engineering', 'til', 'perspectives', 'misc'] as const;

export default function sitemap(): MetadataRoute.Sitemap {
  return locales.flatMap((locale) => {
    const articles = getArticles(locale);
    const corePaths = ['', '/blog', '/about', ...categories.map((category) => `/blog/category/${category}`)];
    const entries: MetadataRoute.Sitemap = corePaths.map((path) => ({
      url: absoluteUrl(`/${locale}${path}`),
      alternates: {
        languages: Object.fromEntries(locales.map((value) => [value, absoluteUrl(`/${value}${path}`)])),
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
        alternates: { languages: articleAlternates(article) },
      })),
    ];
  });
}
