import { Suspense } from 'react';
import { locale as rootLocale } from 'next/root-params';

import { isClientNavigation } from '@/_app/index.server';
import { SearchRoute } from '@/_pages/search/index.server';
import { staticPageMetadata } from '@/shared/seo';
import { LoadingState } from '@/shared/ui';

interface IPageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}
async function RouteContent(props: IPageProps) {
  return (
    <SearchRoute locale={await rootLocale()} {...props} blockUntilReady={!(await isClientNavigation())} />
  );
}
export async function generateMetadata() {
  return staticPageMetadata('search', await rootLocale());
}
export default function Page(props: IPageProps) {
  return (
    <Suspense fallback={<LoadingState />}>
      <RouteContent {...props} />
    </Suspense>
  );
}
