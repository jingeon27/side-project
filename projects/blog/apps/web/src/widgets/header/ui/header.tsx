import Image from 'next/image';
import Link from 'next/link';

import { uniq } from 'es-toolkit';

import { LocaleSwitch } from '@/features/locale-switch/ui/locale-switch';
import { ThemeSwitch } from '@/features/theme-switch/ui/theme-switch';
import { getArticles } from '@/shared/article/lib/get-articles';
import type { Locale } from '@/shared/article/model/types';
import { labels } from '@/shared/config/labels';

import { HeaderNav } from './header-nav';

export function Header({ locale }: { locale: Locale }) {
  const t = labels(locale);
  const translations = Object.fromEntries(
    getArticles(locale).map((article) => [article.slug, article.translations]),
  );
  const targetTags = uniq(getArticles(locale === 'ko' ? 'en' : 'ko').flatMap((article) => article.tags));
  return (
    <>
      <a className="skip-link" href="#main-content">
        {t.nav.skip}
      </a>
      <header className="site-header">
        <div className="header-inner">
          <Link href={`/${locale}`} className="wordmark">
            <Image src="/icon.svg" alt="" aria-hidden width={28} height={28} unoptimized />
            <span>{t.nav.siteTitle}</span>
          </Link>
          <div className="header-right">
            <HeaderNav locale={locale} />
            <div className="header-tools">
              <LocaleSwitch locale={locale} translations={translations} targetTags={targetTags} />
              <ThemeSwitch locale={locale} />
            </div>
          </div>
        </div>
      </header>
    </>
  );
}
