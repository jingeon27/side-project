import { locale as rootLocale } from 'next/root-params';
import { GuideTopbar } from '@/_pages/info';

export default async function Page() {
  return <GuideTopbar locale={await rootLocale()} />;
}

export const instant = false;
