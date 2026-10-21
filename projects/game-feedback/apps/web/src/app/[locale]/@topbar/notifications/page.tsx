import { locale as rootLocale } from 'next/root-params';

import { NotificationsTopbar } from '@/_pages/notifications';

export default async function Page() {
  return <NotificationsTopbar locale={await rootLocale()} />;
}

export const instant = false;
