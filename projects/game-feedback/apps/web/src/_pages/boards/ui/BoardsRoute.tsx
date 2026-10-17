import 'server-only';
import { notFound } from 'next/navigation';
import { boardBySlug } from '@/features/board';
import { createPageMetadata, pageUrl, JsonLd } from '@/shared/seo';
import { BoardsPage } from './BoardsPage';

export function BoardsRoute({ locale, slug }: { locale: string; slug: string }) {
  const board = boardBySlug(slug);
  if (!board) notFound();
  const url = pageUrl(`/${locale}/boards/${board.slug}`);
  return (
    <>
      <JsonLd
        data={{
          '@context': 'https://schema.org',
          '@type': 'CollectionPage',
          '@id': url,
          url,
          name: `${board.name} 게시판`,
          description: board.description,
        }}
      />
      <BoardsPage locale={locale} slug={slug} />
    </>
  );
}
export function boardMetadata(locale: string, slug: string) {
  const board = boardBySlug(slug);
  if (!board) notFound();
  return createPageMetadata({
    title: `${board.name} 게시판`,
    description: board.description,
    path: `/${locale}/boards/${board.slug}`,
    keywords: [board.name, '클래시 로얄 게시판'],
  });
}
