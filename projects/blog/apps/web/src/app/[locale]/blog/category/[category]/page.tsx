import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getArticles } from '@/entities/article/lib/get-articles';
import { labels } from '@/shared/config/labels';
import { pageMetadata } from '@/shared/lib/seo/metadata';
import { BlogFeed } from '@/widgets/blog-feed/ui/blog-feed';

const categories = ['engineering', 'til', 'perspectives', 'misc'] as const;
type Props = { params: Promise<{ locale: string; category: string }> };
export const dynamicParams = false;
function isCategory(value: string): value is (typeof categories)[number] {
  return categories.some((category) => category === value);
}
export function generateStaticParams() {
  return ['ko', 'en'].flatMap((locale) => categories.map((category) => ({ locale, category })));
}
export async function generateMetadata({ params }: Props) {
  const { locale, category } = await params;
  if ((locale !== 'ko' && locale !== 'en') || !isCategory(category)) notFound();
  const t = labels(locale);
  return pageMetadata(
    locale,
    'blog',
    `/blog/category/${category}`,
    t.categories[category],
    t.categoryDescriptions[category],
  );
}
export default async function CategoryPage({ params }: Props) {
  const { locale, category } = await params;
  if ((locale !== 'ko' && locale !== 'en') || !isCategory(category)) notFound();
  const t = labels(locale);
  return (
    <main id="main-content" className="page-container archive-page">
      <header className="page-heading">
        <Link className="back-link" href={`/${locale}/blog`}>
          ← {t.common.backToBlog}
        </Link>
        <p className="eyebrow">{t.common.category}</p>
        <h1>
          {t.categories[category]}
          <span className="title-period">.</span>
        </h1>
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
