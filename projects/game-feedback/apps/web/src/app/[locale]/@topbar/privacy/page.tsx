import { locale as rootLocale } from 'next/root-params';
import { PrivacyTopbar } from '@/_pages/info';

export default async function Page() {
  return <PrivacyTopbar locale={await rootLocale()} />;
}

export const instant = false;
