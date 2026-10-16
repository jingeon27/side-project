import type { Metadata } from 'next';
import ko from '../../../../seo/ko.json';
import en from '../../../../seo/en.json';
import { locales, type Locale } from '@/i18n/routing';
import { absoluteUrl, author, siteUrl } from '@/shared/config/site';

const seo = { ko, en };

export interface ArticleSeo {
  id: string;
  locale: Locale;
  title: string;
  slug: string;
  description: string;
  keywords: string[];
  category: string;
  tags: string[];
  publishedAt: string;
  updatedAt?: string;
  coverImage?: string;
  translations: Partial<Record<Locale, string>>;
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

export function pageMetadata(
  locale: Locale,
  page: 'home' | 'blog' | 'about',
  path = page === 'home' ? '' : `/${page}`,
  title = seo[locale].pages[page].title,
  description = seo[locale].pages[page].description,
): Metadata {
  const url = absoluteUrl(`/${locale}${path}`);
  const languages = Object.fromEntries(
    (path.includes('/tag/') ? [locale] : locales).map((value) => [value, absoluteUrl(`/${value}${path}`)]),
  );
  const image = absoluteUrl('/opengraph-image');
  return {
    metadataBase: siteUrl,
    title: { absolute: `${title} · ${seo[locale].site.title}` },
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

export function articleMetadata(article: ArticleSeo): Metadata {
  const url = absoluteUrl(articlePath(article.locale, article.slug));
  const image = absoluteUrl(article.coverImage || `/og/${article.locale}/${article.id}`);
  return {
    ...pageMetadata(article.locale, 'blog'),
    title: { absolute: `${article.title} · ${seo[article.locale].site.title}` },
    description: article.description,
    keywords: article.keywords,
    alternates: { canonical: url, languages: articleAlternates(article) },
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
      images: [{ url: image, width: 1200, height: 630, alt: article.title }],
    },
    twitter: {
      card: 'summary_large_image',
      title: article.title,
      description: article.description,
      images: [image],
    },
  };
}
