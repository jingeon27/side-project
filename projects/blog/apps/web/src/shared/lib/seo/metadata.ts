import type { Metadata } from 'next';

import { locales, type Locale } from '@/i18n/routing';
import type { Article } from '@/shared/article/model/types';
import imageSizes from '@/shared/config/image-sizes.json';
import { absoluteUrl, author, siteUrl } from '@/shared/config/site';

import en from '../../../../seo/en.json';
import ko from '../../../../seo/ko.json';

const seo = { ko, en };

/** The article fields that metadata, structured data and RSS read. */
export type ArticleSeo = Omit<Article, 'readingMinutes' | 'toc'>;

/** Indexed tag pages each describe their own tag rather than repeating the blog description. */
export function tagDescription(locale: Locale, tag: string): string {
  return seo[locale].pages.tag.description.replace('{tag}', tag);
}

export function articlePath(locale: Locale, slug: string): string {
  return `/${locale}/blog/${encodeURIComponent(slug)}`;
}

export function articleAlternates(article: ArticleSeo): Record<string, string> {
  const translations = { ...article.translations, [article.locale]: article.slug };
  return Object.fromEntries(
    locales.flatMap((locale) => {
      const slug = translations[locale];
      return slug ? [[locale, absoluteUrl(articlePath(locale, slug))]] : [];
    }),
  );
}

/**
 * Adds x-default to a multilingual hreflang set. Unmatched languages land on the Korean
 * version, the site's default locale.
 */
export function withDefaultLanguage(languages: Record<string, string>): Record<string, string> {
  const { ko } = languages;
  return ko && Object.keys(languages).length > 1 ? { ...languages, 'x-default': ko } : languages;
}

export function pageMetadata(
  locale: Locale,
  page: 'home' | 'blog' | 'about' | 'privacy',
  path = page === 'home' ? '' : `/${page}`,
  title = seo[locale].pages[page].title,
  description = seo[locale].pages[page].description,
  /** Locales where the same path exists. Tag and category pages only exist where they have articles. */
  alternateLocales: readonly Locale[] = path.includes('/tag/') ? [locale] : locales,
): Metadata {
  const url = absoluteUrl(`/${locale}${path}`);
  const languages = withDefaultLanguage(
    Object.fromEntries(alternateLocales.map((value) => [value, absoluteUrl(`/${value}${path}`)])),
  );
  const image = absoluteUrl('/opengraph-image');
  return {
    metadataBase: siteUrl,
    title: { absolute: title === seo[locale].site.title ? title : `${title} - ${seo[locale].site.title}` },
    description,
    keywords: seo[locale].site.keywords,
    authors: [{ name: author.name, url: author.github }],
    alternates: {
      canonical: url,
      languages,
      types: { 'application/rss+xml': absoluteUrl(`/rss/${locale}`) },
    },
    openGraph: {
      type: 'website',
      title,
      description,
      url,
      locale: locale === 'ko' ? 'ko_KR' : 'en_US',
      siteName: seo[locale].site.title,
      images: [{ url: image, width: 1200, height: 630, alt: seo[locale].site.title }],
    },
    twitter: { card: 'summary_large_image', title, description, images: [image] },
    robots: { index: true, follow: true },
    verification: process.env.GOOGLE_SITE_VERIFICATION
      ? { google: process.env.GOOGLE_SITE_VERIFICATION }
      : undefined,
  };
}

/**
 * The image that represents an article in share previews and structured data. Content
 * validation keeps it a JPG or PNG: an AVIF cover always comes with a socialImage.
 */
export function articleImagePath(article: ArticleSeo): string {
  return article.socialImage ?? article.coverImage ?? `/og/${article.locale}/${article.id}`;
}

export function articleMetadata(article: ArticleSeo): Metadata {
  const url = absoluteUrl(articlePath(article.locale, article.slug));
  const imagePath = articleImagePath(article);
  const image = absoluteUrl(imagePath);
  const size = imageSizes[imagePath as keyof typeof imageSizes] ?? { width: 1200, height: 630 };
  const base = pageMetadata(article.locale, 'blog');
  return {
    ...base,
    title: { absolute: `${article.title} - ${seo[article.locale].site.title}` },
    description: article.description,
    keywords: article.keywords,
    // Keep the RSS alternate from the base metadata; only canonical and hreflang are per article.
    alternates: {
      ...base.alternates,
      canonical: url,
      languages: withDefaultLanguage(articleAlternates(article)),
    },
    openGraph: {
      type: 'article',
      title: article.title,
      description: article.description,
      url,
      locale: article.locale === 'ko' ? 'ko_KR' : 'en_US',
      siteName: seo[article.locale].site.title,
      publishedTime: article.publishedAt,
      modifiedTime: article.updatedAt || article.publishedAt,
      authors: [author.github],
      section: article.category,
      tags: article.tags,
      images: [{ url: image, ...size, alt: article.title }],
    },
    twitter: {
      card: 'summary_large_image',
      title: article.title,
      description: article.description,
      images: [image],
    },
  };
}
