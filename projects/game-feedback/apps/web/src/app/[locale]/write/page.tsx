import { ComposeRoute } from '@/_pages/compose/index.server';
import { staticPageMetadata } from '@/shared/seo';

interface IPageProps {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ board?: string | string[]; game?: string | string[] }>;
}

export default async function Page({ params, searchParams }: IPageProps) {
  const { locale } = await params;
  const { board, game } = await searchParams;
  return <ComposeRoute locale={locale} board={board} game={game} />;
}

export async function generateMetadata({ params }: IPageProps) {
  return staticPageMetadata('write', (await params).locale);
}
