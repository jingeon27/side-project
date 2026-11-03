import 'server-only';

import { Suspense, type ReactNode } from 'react';

import { appRoutes } from '@game-feedback/bridge';

import { boardBySlug } from '@/features/board';
import { JsonLd, pageUrl } from '@/shared/seo';
import { CommunityPage } from '@/widgets/community-shell';

import type { IBoardPageProps } from '../../model/board-page.type';
import type { IBoardSnapshot } from '../../model/board-snapshot.type';
import { BoardsTopbar } from '../BoardsTopbar';

interface IBoardFrameProps extends IBoardPageProps {
  slug: string;
  children: ReactNode;
}

/** 게시판 라우트가 공유하는 상단바·탐색 셸과 JSON-LD. 본문은 각 라우트가 선언한다. */
export function BoardFrame({ locale, slug, initialBoard, children }: IBoardFrameProps) {
  return (
    <>
      {'then' in initialBoard ? (
        <Suspense fallback={null}>
          <DeferredBoardJsonLd locale={locale} slug={slug} initialBoard={initialBoard} />
        </Suspense>
      ) : (
        <BoardJsonLd locale={locale} slug={slug} initialBoard={initialBoard} />
      )}
      <CommunityPage
        screenKey={`boards:${slug}`}
        locale={locale}
        topbar={<BoardsTopbar locale={locale} slug={slug} />}
      >
        {children}
      </CommunityPage>
    </>
  );
}

async function DeferredBoardJsonLd({
  locale,
  slug,
  initialBoard,
}: {
  locale: string;
  slug: string;
  initialBoard: Promise<IBoardSnapshot>;
}) {
  const initial = await initialBoard.catch(() => null);
  if (!initial) return null;
  return <BoardJsonLd locale={locale} slug={slug} initialBoard={initial} />;
}

function BoardJsonLd({
  locale,
  slug,
  initialBoard,
}: {
  locale: string;
  slug: string;
  initialBoard: IBoardSnapshot;
}) {
  const { game } = initialBoard;
  const board = boardBySlug(slug);
  if (!board) return null;
  const url = pageUrl(appRoutes.boards(locale, slug, undefined, game.slug));
  return (
    <JsonLd
      data={{
        '@context': 'https://schema.org',
        '@type': 'CollectionPage',
        '@id': url,
        url,
        name: `${game.name} ${board.name}`,
        description: board.description,
      }}
    />
  );
}
