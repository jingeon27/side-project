import { notFound } from 'next/navigation';
import { CommunityShell } from '@/_app';
export default async function LocaleLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  if (!['ko', 'ja', 'en'].includes(locale)) notFound();
  return <CommunityShell locale={locale}>{children}</CommunityShell>;
}
