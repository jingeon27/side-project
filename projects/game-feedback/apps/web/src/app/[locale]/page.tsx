import { locale as rootLocale } from 'next/root-params';
import { Suspense } from 'react';
import { LoadingState } from '@/shared/ui';
import { PublicPageJsonLd, staticPageMetadata } from '@/shared/seo';
import { FeedPage as FeedScreen } from '@/_pages/feed';
async function RouteContent(_props: { params: Promise<{ locale: string }> }) {
  const locale = await rootLocale();
  return (
    <>
      <PublicPageJsonLd kind="feed" locale={locale} />
      <FeedScreen locale={locale} />
    </>
  );
}

export async function generateMetadata(_props: { params: Promise<{ locale: string }> }) {
  return staticPageMetadata('feed', await rootLocale());
}

export default function Page(props: Parameters<typeof RouteContent>[0]) {
  return (
    <Suspense fallback={<LoadingState />}>
      <RouteContent {...props} />
    </Suspense>
  );
}
