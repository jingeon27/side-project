import { staticPageMetadata } from '@/shared/seo';
import { SettingsPage as Screen } from '@/_pages/settings';
export default async function SettingsPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  return <Screen locale={locale} />;
}

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }) {
  return staticPageMetadata('settings', (await params).locale);
}
