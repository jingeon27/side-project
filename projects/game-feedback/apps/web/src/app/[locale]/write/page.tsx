import { Suspense } from 'react';
import { LoadingState } from '@/shared/ui';
import { ComposeRoute } from '@/_pages/compose/index.server';
import { staticPageMetadata } from '@/shared/seo';

interface IPageProps {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{
    board?: string | string[];
    game?: string | string[];
    battleMode?: string | string[];
    coachingRole?: string | string[];
  }>;
}

async function RouteContent({ params, searchParams }: IPageProps) {
  const { locale } = await params;
  const { board, game, battleMode, coachingRole } = await searchParams;
  return (
    <ComposeRoute
      locale={locale}
      board={board}
      game={game}
      battleMode={battleMode}
      coachingRole={coachingRole}
    />
  );
}

export async function generateMetadata({ params }: IPageProps) {
  return staticPageMetadata('write', (await params).locale);
}

export default function Page(props: Parameters<typeof RouteContent>[0]) {
  return (
    <Suspense fallback={<LoadingState />}>
      <RouteContent {...props} />
    </Suspense>
  );
}
