import { staticPageMetadata } from '@/shared/seo';
import { NotificationsPage as Screen } from '@/_pages/notifications';
export default async function NotificationsPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  return <Screen locale={locale} />;
}

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }) {
  return staticPageMetadata('notifications', (await params).locale);
}
