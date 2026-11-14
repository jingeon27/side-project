import Link from 'next/link';
import { notFound } from 'next/navigation';

import { uniq } from 'es-toolkit';

import { isLocale, locales } from '@/i18n/routing';
import { getArticles, getIndexedTags } from '@/shared/article/lib/get-articles';
import { labels } from '@/shared/config/labels';
import { pageMetadata, tagDescription } from '@/shared/lib/seo/metadata';
import { BlogFeed } from '@/widgets/blog-feed/ui/blog-feed';

type Props = { params: Promise<{ locale: string; tag: string }> };

function decodeTag(tag: string): string {
  try {
    return decodeURIComponent(tag);
  } catch {
    return tag;
  }
}
export function generateStaticParams() {
  return locales.flatMap((locale) =>
    uniq(getArticles(locale).flatMap((article) => article.tags)).map((tag) => ({ locale, tag })),
  );
}
export async function generateMetadata({ params }: Props) {
  const { locale, tag } = await params;
  if (!isLocale(locale)) notFound();
  const name = getArticles(locale).some((article) => article.tags.includes(tag)) ? tag : decodeTag(tag);
  if (!getArticles(locale).some((article) => article.tags.includes(name))) notFound();
  const title = `#${name}`;
  return {
    ...pageMetadata(
      locale,
      'blog',
      `/blog/tag/${encodeURIComponent(name)}`,
      title,
      tagDescription(locale, title),
    ),
    robots: { index: getIndexedTags(locale).includes(name), follow: true },
  };
}
export default async function TagPage({ params }: Props) {
  const { locale, tag } = await params;
  if (!isLocale(locale)) notFound();
  const name = getArticles(locale).some((article) => article.tags.includes(tag)) ? tag : decodeTag(tag);
  const articles = getArticles(locale).filter((article) => article.tags.includes(name));
  if (!articles.length) notFound();
  const t = labels(locale);
  return (
    <main id="main-content" className="page-container archive-page">
      <header className="page-heading">
        <Link className="back-link" href={`/${locale}/blog`}>
          {t.common.backToBlog}
        </Link>
        <h1>#{name}</h1>
        <p>{t.blog.tagDescription}</p>
      </header>
      <BlogFeed locale={locale} articles={articles} fixedTag={name} />
    </main>
  );
}
