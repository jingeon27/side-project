import { locale as rootLocale } from 'next/root-params';

import { isClientNavigation } from '@/_app/index.server';
import { BattleBoardRoute, boardMetadata } from '@/_pages/boards/index.server';

interface IPageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

export async function generateMetadata({ searchParams }: IPageProps) {
  return boardMetadata(await rootLocale(), 'friendly', (await searchParams).game);
}

export default async function Page({ searchParams }: IPageProps) {
  return (
    <BattleBoardRoute
      locale={await rootLocale()}
      searchParams={searchParams}
      blockUntilReady={!(await isClientNavigation())}
    />
  );
}

// Initial public HTML is complete; instant() verifies the prefetched navigation controls.
export const instant = false;
