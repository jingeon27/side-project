import type { Metadata } from 'next';
import { notFound } from 'next/navigation';

import { NextIntlClientProvider } from 'next-intl';
import { getMessages, setRequestLocale } from 'next-intl/server';

import { AnalyticsConsent } from '@/features/analytics-consent/ui/analytics-consent';
import { AnalyticsTracker } from '@/features/analytics-consent/ui/analytics-tracker';
import { isLocale, locales } from '@/i18n/routing';
import { siteUrl } from '@/shared/config/site';
import { serializeJsonLd, websiteJsonLd } from '@/shared/lib/seo/structured-data';
import { Footer } from '@/widgets/footer/ui/footer';
import { Header } from '@/widgets/header/ui/header';

import '../globals.css';

export const metadata: Metadata = { metadataBase: siteUrl };
export function generateStaticParams() {
  return locales.map((locale) => ({ locale }));
}
const initialTheme = `(function(){try{var t=localStorage.getItem('blog-theme');document.documentElement.dataset.theme=t==='dark'||t==='light'?t:matchMedia('(prefers-color-scheme: dark)').matches?'dark':'light'}catch(e){}})()`;
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
      <head>
        <script dangerouslySetInnerHTML={{ __html: initialTheme }} />
      </head>
      <body id="top">
        <NextIntlClientProvider messages={messages}>
          <Header locale={locale} />
          {children}
          <Footer locale={locale} />
          <AnalyticsConsent locale={locale} />
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
