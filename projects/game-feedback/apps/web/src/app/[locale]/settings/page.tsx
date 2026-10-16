import { Settings } from '@/components/settings';
export default async function SettingsPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  return <Settings locale={locale} />;
}
