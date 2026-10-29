import { locale as rootLocale } from 'next/root-params';

import { InfoPage } from '@/_pages/info';
import { PublicPageJsonLd, staticPageMetadata } from '@/shared/seo';

async function RouteContent(_props: { params: Promise<{ locale: string }> }) {
  const locale = await rootLocale();
  return (
    <>
      <PublicPageJsonLd kind="contact" locale={locale} />
      <InfoPage kind="contact" locale={locale} />
    </>
  );
}

export async function generateMetadata(_props: { params: Promise<{ locale: string }> }) {
  return staticPageMetadata('contact', await rootLocale());
}

export default function Page(props: Parameters<typeof RouteContent>[0]) {
  return <RouteContent {...props} />;
}

// Public information stays readable in the first document without JavaScript.
export const instant = false;
