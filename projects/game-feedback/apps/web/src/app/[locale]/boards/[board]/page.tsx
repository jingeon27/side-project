import { DocumentContent } from '@/_app/index.server';
import { BoardsRoute, boardMetadata } from '@/_pages/boards/index.server';
interface IPageProps {
  params: Promise<{ locale: string; board: string }>;
  searchParams: Promise<{ game?: string | string[] }>;
}
async function RouteContent({ params, searchParams }: IPageProps) {
  const { locale, board } = await params;
  const { game } = await searchParams;
  return <BoardsRoute locale={locale} slug={board} game={game} />;
}
export async function generateMetadata({ params, searchParams }: IPageProps) {
  const { locale, board } = await params;
  const { game } = await searchParams;
  return boardMetadata(locale, board, game);
}

export default function Page(props: Parameters<typeof RouteContent>[0]) {
  return (
    <DocumentContent>
      <RouteContent {...props} />
    </DocumentContent>
  );
}

// Public documents deliberately finish authorized HTML and SEO before streaming.
// Production instant() tests guard the separate RSC navigation shell.
export const instant = false;
