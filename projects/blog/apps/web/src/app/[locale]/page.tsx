import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getArticles } from '@/entities/article/lib/get-articles';
import { ArticleCard } from '@/entities/article/ui/article-card';
import { labels } from '@/shared/config/labels';
import { ArrowIcon } from '@/shared/ui/icon';
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
  const categories = ['engineering', 'til', 'perspectives', 'misc'] as const;
  return (
    <main id="main-content" className="page-container home-page">
      <section className="home-hero">
        <div className="hero-copy">
          <p className="eyebrow">
            <span className="status-dot" />
            {t.home.eyebrow}
          </p>
          <h1>{t.home.title}</h1>
          <p className="hero-description">{t.home.description}</p>
          <Link className="text-link hero-link" href={`/${locale}/blog`}>
            {t.common.allArticles}
            <ArrowIcon />
          </Link>
        </div>
        <div className="journal-index">
          <div className="index-caption">
            <span>FIELD NOTES</span>
            <span>01 — 04</span>
          </div>
          <p className="index-title">
            Build.
            <br />
            Understand.
            <br />
            <span>Write it down.</span>
          </p>
          <div className="index-bottom">
            <span>{t.home.role}</span>
            <span className="index-coordinate">INDEPENDENT JOURNAL</span>
          </div>
          <div className="index-lines" aria-hidden="true">
            <i />
            <i />
            <i />
            <i />
          </div>
        </div>
      </section>
      <section className="category-section" aria-label={t.home.explore}>
        {categories.map((category, index) => (
          <Link className="category-entry" key={category} href={`/${locale}/blog/category/${category}`}>
            <span className="category-entry-number">0{index + 1}</span>
            <div>
              <h2>
                {t.categories[category]}
                <ArrowIcon />
              </h2>
              <p>{t.categoryDescriptions[category]}</p>
            </div>
            <span className="category-count">
              {String(articles.filter((article) => article.category === category).length).padStart(2, '0')}
            </span>
          </Link>
        ))}
      </section>
      <section className="recent-section">
        <div className="section-heading">
          <div>
            <p className="eyebrow">LATEST ENTRIES</p>
            <h2>
              {t.home.latest}
              <span className="heading-count">{articles.length}</span>
            </h2>
            <p>{t.home.latestDescription}</p>
          </div>
          <Link className="text-link small-link" href={`/${locale}/blog`}>
            {t.common.allArticles}
            <ArrowIcon />
          </Link>
        </div>
        {articles.length ? (
          <div className="article-list">
            {articles.slice(0, 5).map((article, index) => (
              <ArticleCard key={article.id} article={article} index={index} />
            ))}
          </div>
        ) : (
          <div className="empty-state">
            <h3>{t.common.empty}</h3>
            <p>{t.common.emptyDescription}</p>
            <Link className="text-link" href="/ko/blog">
              {t.common.koreanArticles}
              <ArrowIcon />
            </Link>
          </div>
        )}
      </section>
    </main>
  );
}
