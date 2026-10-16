import { notFound } from 'next/navigation';
import { getArticles, getArticleBySlug } from '@/entities/article/lib/get-articles';
import { loadArticle } from '@/entities/article/lib/registry';
import { articleMetadata } from '@/shared/lib/seo/metadata';
import { articleJsonLd, serializeJsonLd } from '@/shared/lib/seo/structured-data';
import { ArticleReader } from '@/widgets/article-reader/ui/article-reader';

type Props = { params: Promise<{ locale: string; slug: string }> };

function decodeSlug(slug: string): string {
  try {
    return decodeURIComponent(slug);
  } catch {
    return slug;
  }
}
export function generateStaticParams() {
  return (['ko', 'en'] as const).flatMap((locale) =>
    getArticles(locale).map((article) => ({ locale, slug: article.slug })),
  );
}
export async function generateMetadata({ params }: Props) {
  const { locale, slug } = await params;
  if (locale !== 'ko' && locale !== 'en') notFound();
  const article = getArticleBySlug(locale, slug) ?? getArticleBySlug(locale, decodeSlug(slug));
  if (!article) notFound();
  return articleMetadata(article);
}
export default async function ArticlePage({ params }: Props) {
  const { locale, slug } = await params;
  if (locale !== 'ko' && locale !== 'en') notFound();
  const article = getArticleBySlug(locale, slug) ?? getArticleBySlug(locale, decodeSlug(slug));
  if (!article) notFound();
  const { default: Content } = await loadArticle(article.id, locale);
  return (
    <>
      <ArticleReader article={article} articles={getArticles(locale)}>
        <Content />
      </ArticleReader>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: serializeJsonLd(articleJsonLd(article)) }}
      />
    </>
  );
}
