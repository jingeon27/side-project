import { notFound } from 'next/navigation';

import { isLocale } from '@/i18n/routing';
import { getArticles } from '@/shared/article/lib/get-articles';
import { labels } from '@/shared/config/labels';
import { pageMetadata } from '@/shared/lib/seo/metadata';
import { BlogFeed } from '@/widgets/blog-feed/ui/blog-feed';

type Props = { params: Promise<{ locale: string }> };
export async function generateMetadata({ params }: Props) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();
  return pageMetadata(locale, 'blog');
}
export default async function BlogPage({ params }: Props) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();
  const t = labels(locale);
  return (
    <main id="main-content" className="page-container archive-page">
      <header className="page-heading">
        <h1>{t.blog.title}</h1>
      </header>
      <BlogFeed locale={locale} articles={getArticles(locale)} />
    </main>
  );
}
