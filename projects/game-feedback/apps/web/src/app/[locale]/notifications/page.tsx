import { NotificationsPage as Screen } from '@/_pages/notifications';
export default async function NotificationsPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  return <Screen locale={locale} />;
}
