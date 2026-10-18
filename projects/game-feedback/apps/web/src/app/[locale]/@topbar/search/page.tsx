import { locale as rootLocale } from 'next/root-params';
import { SearchTopbar } from '@/_pages/search';

export default async function Page() {
  return <SearchTopbar locale={await rootLocale()} />;
}

export const instant = false;
