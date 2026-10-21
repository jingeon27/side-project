import { locale as rootLocale } from 'next/root-params';

import { ProfileTopbar } from '@/_pages/profile';

export default async function Page() {
  return <ProfileTopbar locale={await rootLocale()} />;
}

export const instant = false;
