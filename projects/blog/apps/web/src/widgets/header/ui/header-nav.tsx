'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { labels, type UiLocale } from '@/shared/config/labels';

export function HeaderNav({ locale }: { locale: UiLocale }) {
  const pathname = usePathname();
  const t = labels(locale);
  return (
    <nav className="header-nav" aria-label={locale === 'ko' ? '주 메뉴' : 'Main navigation'}>
      {[
        { href: `/${locale}/blog`, label: t.nav.blog },
        { href: `/${locale}/about`, label: t.nav.about },
      ].map((item) => (
        <Link
          key={item.href}
          href={item.href}
          aria-current={pathname.startsWith(item.href) ? 'page' : undefined}
        >
          {item.label}
        </Link>
      ))}
    </nav>
  );
}
