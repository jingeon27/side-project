import type { Metadata } from 'next';
import { notFound } from 'next/navigation';

import { NextIntlClientProvider } from 'next-intl';
import { getMessages, setRequestLocale } from 'next-intl/server';

import { AnalyticsTracker } from '@/features/analytics-consent/ui/analytics-tracker';
import { isLocale } from '@/i18n/routing';
import { siteUrl } from '@/shared/config/site';
import { serializeJsonLd, websiteJsonLd } from '@/shared/lib/seo/structured-data';
import { ThemeInitializer } from '@/shared/ui/theme-initializer';
import { Footer } from '@/widgets/footer/ui/footer';
import { Header } from '@/widgets/header/ui/header';

import '../globals.css';

export const metadata: Metadata = { metadataBase: siteUrl };
export function generateStaticParams() {
  return [{ locale: 'ko' }, { locale: 'en' }];
}
export default async function LocaleLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();
  setRequestLocale(locale);
  const messages = await getMessages();
  return (
    <html lang={locale} suppressHydrationWarning>
      <body id="top">
        <ThemeInitializer />
        <NextIntlClientProvider messages={messages}>
          <Header locale={locale} />
          {children}
          <Footer locale={locale} />
          <AnalyticsTracker />
        </NextIntlClientProvider>
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: serializeJsonLd(websiteJsonLd(locale)) }}
        />
      </body>
    </html>
  );
}
