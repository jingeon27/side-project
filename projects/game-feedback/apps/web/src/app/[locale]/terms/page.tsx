import { InfoPage } from '@/_pages/info';
export default async function Page({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  return <InfoPage kind="terms" locale={locale} />;
}
