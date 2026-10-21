import { Suspense } from 'react';
import { locale as rootLocale } from 'next/root-params';

import { ContactPage } from '@/_pages/contact';
import { InfoPage } from '@/_pages/info';
import { PublicPageJsonLd, staticPageMetadata } from '@/shared/seo';
import { LoadingState } from '@/shared/ui';

async function RouteContent(_props: { params: Promise<{ locale: string }> }) {
  const locale = await rootLocale();
  return (
    <>
      <PublicPageJsonLd kind="contact" locale={locale} />
      <InfoPage kind="contact" locale={locale} />
      <ContactPage />
    </>
  );
}

export async function generateMetadata(_props: { params: Promise<{ locale: string }> }) {
  return staticPageMetadata('contact', await rootLocale());
}

export default function Page(props: Parameters<typeof RouteContent>[0]) {
  return (
    <Suspense fallback={<LoadingState />}>
      <RouteContent {...props} />
    </Suspense>
  );
}
