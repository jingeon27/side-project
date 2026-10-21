import { locale as rootLocale } from 'next/root-params';

import { SettingsTopbar } from '@/_pages/settings';

export default async function Page() {
  return <SettingsTopbar locale={await rootLocale()} />;
}

export const instant = false;
