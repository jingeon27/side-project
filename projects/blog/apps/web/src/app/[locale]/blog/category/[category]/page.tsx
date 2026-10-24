import Link from 'next/link';
import { notFound } from 'next/navigation';

import { getArticles, getCategoryLocales, getPublishedCategories } from '@/entities/article/lib/get-articles';
import type { Category, Locale } from '@/entities/article/model/types';
import { labels } from '@/shared/config/labels';
import { pageMetadata } from '@/shared/lib/seo/metadata';
import { BlogFeed } from '@/widgets/blog-feed/ui/blog-feed';

type Props = { params: Promise<{ locale: string; category: string }> };
export const dynamicParams = false;
/** Only categories with articles in the locale are published; empty ones return 404. */
function isPublishedCategory(locale: Locale, value: string): value is Category {
  return getPublishedCategories(locale).some((category) => category === value);
}
export function generateStaticParams() {
  return (['ko', 'en'] as const).flatMap((locale) =>
    getPublishedCategories(locale).map((category) => ({ locale, category })),
  );
}
export async function generateMetadata({ params }: Props) {
  const { locale, category } = await params;
  if ((locale !== 'ko' && locale !== 'en') || !isPublishedCategory(locale, category)) notFound();
  const t = labels(locale);
  return pageMetadata(
    locale,
    'blog',
    `/blog/category/${category}`,
    t.categories[category],
    t.categoryDescriptions[category],
    getCategoryLocales(category),
  );
}
export default async function CategoryPage({ params }: Props) {
  const { locale, category } = await params;
  if ((locale !== 'ko' && locale !== 'en') || !isPublishedCategory(locale, category)) notFound();
  const t = labels(locale);
  return (
    <main id="main-content" className="page-container archive-page">
      <header className="page-heading">
        <Link className="back-link" href={`/${locale}/blog`}>
          {t.common.backToBlog}
        </Link>
        <h1>{t.categories[category]}</h1>
        <p>{t.categoryDescriptions[category]}</p>
      </header>
      <BlogFeed
        locale={locale}
        articles={getArticles(locale).filter((article) => article.category === category)}
        fixedCategory={category}
      />
    </main>
  );
}
