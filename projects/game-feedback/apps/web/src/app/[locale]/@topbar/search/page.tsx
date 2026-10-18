import { locale as rootLocale } from 'next/root-params';
import { PageTopbar } from '@/_app';
export default async function Page() {
  return <PageTopbar locale={await rootLocale()} title="검색" />;
}

// Initial documents may wait for the sibling page; navigation shells are verified with instant().
export const instant = false;
