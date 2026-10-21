import { locale as rootLocale } from 'next/root-params';

import { MessagesTopbar } from '@/_pages/messages';

export default async function Page() {
  return <MessagesTopbar locale={await rootLocale()} />;
}

export const instant = false;
