import { notFound } from 'next/navigation';
import { locale as rootLocale } from 'next/root-params';
import { CommunityShell } from '@/_app';
import { rootMetadata, rootViewport, RootDocument } from '@/_app/index.server';
import { isLocale } from '@/shared/i18n/index.server';
import '@/_app/styles/tailwind.css';

// The initial document waits for its saved appearance and authorized session.
// Next still validates navigations between the child segments.
export const instant = false;
export const metadata = rootMetadata;
export const viewport = rootViewport;
export function generateStaticParams() {
  return [{ locale: 'ko' }, { locale: 'en' }, { locale: 'ja' }];
}
export default async function LocaleLayout({
  children,
  topbar,
}: {
  children: React.ReactNode;
  topbar: React.ReactNode;
}) {
  const locale = await rootLocale();
  if (!isLocale(locale)) notFound();
  return (
    <RootDocument locale={locale}>
      <CommunityShell locale={locale} topbar={topbar}>
        {children}
      </CommunityShell>
    </RootDocument>
  );
}
