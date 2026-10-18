import { locale as rootLocale } from 'next/root-params';
import { Suspense } from 'react';
import { LoadingState } from '@/shared/ui';
import { PublicPageJsonLd, staticPageMetadata } from '@/shared/seo';
import { InfoPage } from '@/_pages/info';
async function RouteContent(_props: { params: Promise<{ locale: string }> }) {
  const locale = await rootLocale();
  return (
    <>
      <PublicPageJsonLd kind="terms" locale={locale} />
      <InfoPage kind="terms" locale={locale} />
    </>
  );
}

export async function generateMetadata(_props: { params: Promise<{ locale: string }> }) {
  return staticPageMetadata('terms', await rootLocale());
}

export default function Page(props: Parameters<typeof RouteContent>[0]) {
  return (
    <Suspense fallback={<LoadingState />}>
      <RouteContent {...props} />
    </Suspense>
  );
}
