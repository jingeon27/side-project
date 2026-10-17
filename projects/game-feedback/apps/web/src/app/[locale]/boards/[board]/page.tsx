import { BoardsRoute, boardMetadata } from '@/_pages/boards/index.server';
interface IPageProps {
  params: Promise<{ locale: string; board: string }>;
}
export default async function Page({ params }: IPageProps) {
  const { locale, board } = await params;
  return <BoardsRoute locale={locale} slug={board} />;
}
export async function generateMetadata({ params }: IPageProps) {
  const { locale, board } = await params;
  return boardMetadata(locale, board);
}
