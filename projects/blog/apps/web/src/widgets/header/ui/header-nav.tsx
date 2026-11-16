'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

import type { Locale } from '@/i18n/routing';
import { labels } from '@/shared/config/labels';

export function HeaderNav({ locale }: { locale: Locale }) {
  const pathname = usePathname();
  const t = labels(locale);
  return (
    <nav className="header-nav" aria-label={t.nav.main}>
      <Link
        href={`/${locale}/blog`}
        aria-current={pathname.startsWith(`/${locale}/blog`) ? 'page' : undefined}
      >
        {t.nav.blog}
      </Link>
      <Link
        href={`/${locale}/about`}
        aria-current={pathname.startsWith(`/${locale}/about`) ? 'page' : undefined}
      >
        {t.nav.about}
      </Link>
    </nav>
  );
}
