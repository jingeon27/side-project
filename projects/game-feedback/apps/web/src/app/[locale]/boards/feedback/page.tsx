import { locale as rootLocale } from 'next/root-params';

import { isClientNavigation } from '@/_app/index.server';
import { boardMetadata, FeedbackBoardRoute } from '@/_pages/boards/index.server';

interface IPageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

export async function generateMetadata({ searchParams }: IPageProps) {
  return boardMetadata(await rootLocale(), 'feedback', (await searchParams).game);
}

export default async function Page({ searchParams }: IPageProps) {
  return (
    <FeedbackBoardRoute
      locale={await rootLocale()}
      searchParams={searchParams}
      blockUntilReady={!(await isClientNavigation())}
    />
  );
}

// Initial public HTML is complete; instant() verifies the prefetched navigation controls.
export const instant = false;
