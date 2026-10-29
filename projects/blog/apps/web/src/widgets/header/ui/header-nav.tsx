'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

import { labels, type UiLocale } from '@/shared/config/labels';

export function HeaderNav({ locale }: { locale: UiLocale }) {
  const pathname = usePathname();
  const t = labels(locale);
  return (
    <nav className="header-nav" aria-label={locale === 'ko' ? '주 메뉴' : 'Main navigation'}>
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
