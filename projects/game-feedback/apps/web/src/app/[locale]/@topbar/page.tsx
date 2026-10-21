import { locale as rootLocale } from 'next/root-params';

import { FeedTopbar } from '@/_pages/feed';

export default async function Page() {
  return <FeedTopbar locale={await rootLocale()} />;
}

export const instant = false;
