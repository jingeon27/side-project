import { locale as rootLocale } from 'next/root-params';

import { isClientNavigation } from '@/_app/index.server';
import { FeedRoute } from '@/_pages/feed/index.server';
import { PublicPageJsonLd, staticPageMetadata } from '@/shared/seo';

async function RouteContent({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const locale = await rootLocale();
  return (
    <>
      <PublicPageJsonLd kind="feed" locale={locale} />
      <FeedRoute
        locale={locale}
        searchParams={searchParams}
        blockUntilReady={!(await isClientNavigation())}
      />
    </>
  );
}

export async function generateMetadata(_props: { params: Promise<{ locale: string }> }) {
  return staticPageMetadata('feed', await rootLocale());
}

export default function Page(props: Parameters<typeof RouteContent>[0]) {
  return <RouteContent {...props} />;
}

// Initial HTML includes the full public list. instant() guards the separate navigation shell.
export const instant = false;
