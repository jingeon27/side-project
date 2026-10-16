import { notFound } from 'next/navigation';
import { Shell } from '@/components/shell';
export default async function LocaleLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  if (!['ko', 'ja', 'en'].includes(locale)) notFound();
  return <Shell locale={locale}>{children}</Shell>;
}
