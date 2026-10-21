import { locale as rootLocale } from 'next/root-params';

import { boardMetadata, BoardsRoute } from '@/_pages/boards/index.server';

import { isClientNavigation } from '../ui/DocumentContent';

export interface IBoardDocumentProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

export async function BoardDocument({ slug, searchParams }: IBoardDocumentProps & { slug: string }) {
  return (
    <BoardsRoute
      locale={await rootLocale()}
      slug={slug}
      searchParams={searchParams}
      blockUntilReady={!(await isClientNavigation())}
    />
  );
}

export async function boardDocumentMetadata(slug: string, { searchParams }: IBoardDocumentProps) {
  return boardMetadata(await rootLocale(), slug, (await searchParams).game);
}
