import { locale as rootLocale } from 'next/root-params';

import { ContactTopbar } from '@/_pages/contact';

export default async function Page() {
  return <ContactTopbar locale={await rootLocale()} />;
}

export const instant = false;
