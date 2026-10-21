import Link from 'next/link';

import { getLocale } from 'next-intl/server';

import { labels } from '@/shared/config/labels';

export default async function NotFound() {
  const current = await getLocale();
  const locale = current === 'en' ? 'en' : 'ko';
  const t = labels(locale);
  return (
    <main id="main-content" className="page-container" style={{ paddingBlock: '6rem' }}>
      <p className="error-code">404</p>
      <h1>{t.notFound.title}</h1>
      <p>{t.notFound.description}</p>
      <Link href={`/${locale}`} className="text-link">
        {t.notFound.home}
      </Link>
    </main>
  );
}
