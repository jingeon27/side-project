import { InfoPage } from '@/components/info-page';
export default async function Page({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  return <InfoPage kind="guide" locale={locale} />;
}
