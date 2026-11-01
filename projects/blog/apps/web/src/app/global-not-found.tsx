import Link from 'next/link';

import { getLocale } from 'next-intl/server';

import { labels } from '@/shared/config/labels';
import { siteUrl } from '@/shared/config/site';

import './globals.css';

export async function generateMetadata() {
  const current = await getLocale();
  const locale = current === 'en' ? 'en' : 'ko';
  return {
    metadataBase: siteUrl,
    title: `404 - ${labels(locale).nav.siteTitle}`,
    robots: { index: false, follow: true },
  };
}

export default async function GlobalNotFound() {
  const current = await getLocale();
  const locale = current === 'en' ? 'en' : 'ko';
  const t = labels(locale);
  return (
    <html lang={locale}>
      <body>
        <main id="main-content" className="page-container" style={{ paddingBlock: '6rem' }}>
          <p className="error-code">404</p>
          <h1>{t.notFound.title}</h1>
          <p>{t.notFound.description}</p>
          <Link href={`/${locale}`} className="text-link">
            {t.notFound.home}
          </Link>
        </main>
      </body>
    </html>
  );
}
