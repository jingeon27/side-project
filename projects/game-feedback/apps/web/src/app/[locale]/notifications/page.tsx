import { Notifications } from '@/components/notifications';
export default async function NotificationsPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  return <Notifications locale={locale} />;
}
