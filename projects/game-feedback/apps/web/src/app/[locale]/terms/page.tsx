import { PublicPageJsonLd, staticPageMetadata } from '@/shared/seo';
import { InfoPage } from '@/_pages/info';
export default async function Page({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  return (
    <>
      <PublicPageJsonLd kind="terms" locale={locale} />
      <InfoPage kind="terms" locale={locale} />
    </>
  );
}

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }) {
  return staticPageMetadata('terms', (await params).locale);
}
