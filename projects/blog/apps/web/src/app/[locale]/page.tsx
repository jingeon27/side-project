import Link from 'next/link';
import { notFound } from 'next/navigation';

import { ArticleCard } from '@/features/article/ui/article-card';
import { getArticles, getPublishedCategories } from '@/shared/article/lib/get-articles';
import { labels } from '@/shared/config/labels';
import { pageMetadata } from '@/shared/lib/seo/metadata';

type Props = { params: Promise<{ locale: string }> };
export async function generateMetadata({ params }: Props) {
  const { locale } = await params;
  if (locale !== 'ko' && locale !== 'en') notFound();
  return pageMetadata(locale, 'home');
}

export default async function HomePage({ params }: Props) {
  const { locale } = await params;
  if (locale !== 'ko' && locale !== 'en') notFound();
  const t = labels(locale);
  const articles = getArticles(locale);
  // Empty category pages are not published, so only link categories that have articles.
  const categories = getPublishedCategories(locale);
  return (
    <main id="main-content" className="page-container home-page">
      <section className="home-hero">
        <div className="hero-copy">
          <h1>{t.home.title}</h1>
          <p className="hero-description">{t.home.description}</p>
        </div>
      </section>
      <nav className="category-section" aria-label={t.home.explore}>
        {categories.map((category) => (
          <Link className="category-entry" key={category} href={`/${locale}/blog/category/${category}`}>
            <span>{t.categories[category]}</span>
            <span className="category-count">
              {articles.filter((article) => article.category === category).length}
            </span>
          </Link>
        ))}
      </nav>
      <section className="recent-section">
        <div className="section-heading">
          <h2>{t.home.latest}</h2>
          <Link className="text-link small-link" href={`/${locale}/blog`}>
            {t.common.allArticles}
          </Link>
        </div>
        {articles.length ? (
          <div className="article-list">
            {articles.slice(0, 5).map((article) => (
              <ArticleCard key={article.id} article={article} />
            ))}
          </div>
        ) : (
          <div className="empty-state">
            <h3>{t.common.empty}</h3>
            <p>{t.common.emptyDescription}</p>
            <Link className="text-link" href="/ko/blog">
              {t.common.koreanArticles}
            </Link>
          </div>
        )}
      </section>
    </main>
  );
}
