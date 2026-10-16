import type { Locale } from '@/i18n/routing';
import { absoluteUrl, author } from '@/shared/config/site';
import { labels } from '@/shared/config/labels';
import { articlePath, type ArticleSeo } from './metadata';

export function websiteJsonLd(locale: Locale) {
  return {
    '@context': 'https://schema.org',
    '@graph': [
      {
        '@type': 'WebSite',
        '@id': absoluteUrl('/#website'),
        name: labels(locale).home.title,
        url: absoluteUrl(`/${locale}`),
        inLanguage: locale,
        author: { '@id': absoluteUrl('/#author') },
      },
      {
        '@type': 'Person',
        '@id': absoluteUrl('/#author'),
        name: author.name,
        url: author.github,
        sameAs: [author.github],
        email: `mailto:${author.email}`,
      },
    ],
  };
}

export function articleJsonLd(article: ArticleSeo) {
  const url = absoluteUrl(articlePath(article.locale, article.slug));
  return {
    '@context': 'https://schema.org',
    '@graph': [
      {
        '@type': 'BlogPosting',
        '@id': `${url}#article`,
        headline: article.title,
        description: article.description,
        datePublished: article.publishedAt,
        dateModified: article.updatedAt || article.publishedAt,
        mainEntityOfPage: url,
        inLanguage: article.locale,
        keywords: article.keywords.join(', '),
        articleSection: article.category,
        image: absoluteUrl(article.coverImage || `/og/${article.locale}/${article.id}`),
        author: { '@type': 'Person', name: author.name, url: author.github },
        publisher: { '@type': 'Person', name: author.name, url: author.github },
      },
      {
        '@type': 'BreadcrumbList',
        itemListElement: [
          {
            '@type': 'ListItem',
            position: 1,
            name: article.locale === 'ko' ? '홈' : 'Home',
            item: absoluteUrl(`/${article.locale}`),
          },
          {
            '@type': 'ListItem',
            position: 2,
            name: article.locale === 'ko' ? '블로그' : 'Blog',
            item: absoluteUrl(`/${article.locale}/blog`),
          },
          { '@type': 'ListItem', position: 3, name: article.title, item: url },
        ],
      },
    ],
  };
}

export function serializeJsonLd(value: unknown): string {
  return JSON.stringify(value).replace(/</g, '\\u003c');
}
