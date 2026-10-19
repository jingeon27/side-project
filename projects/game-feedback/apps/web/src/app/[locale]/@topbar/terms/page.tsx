import { locale as rootLocale } from 'next/root-params';
import { TermsTopbar } from '@/_pages/info';

export default async function Page() {
  return <TermsTopbar locale={await rootLocale()} />;
}

export const instant = false;
