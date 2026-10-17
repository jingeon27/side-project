import { BoardsRoute, boardMetadata } from '@/_pages/boards/index.server';
interface IPageProps {
  params: Promise<{ locale: string; board: string }>;
  searchParams: Promise<{ game?: string | string[] }>;
}
export default async function Page({ params, searchParams }: IPageProps) {
  const { locale, board } = await params;
  const { game } = await searchParams;
  return <BoardsRoute locale={locale} slug={board} game={game} />;
}
export async function generateMetadata({ params, searchParams }: IPageProps) {
  const { locale, board } = await params;
  const { game } = await searchParams;
  return boardMetadata(locale, board, game);
}
