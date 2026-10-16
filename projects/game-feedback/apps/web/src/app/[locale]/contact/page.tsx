import { PublicPageJsonLd, staticPageMetadata } from '@/shared/seo';
import { InfoPage } from '@/_pages/info';
export default async function Page({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  return (
    <>
      <PublicPageJsonLd kind="contact" locale={locale} />
      <InfoPage kind="contact" locale={locale} />
    </>
  );
}

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }) {
  return staticPageMetadata('contact', (await params).locale);
}
