'use client';

import { useState } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';

import type { Locale } from '@/i18n/routing';
import { labels } from '@/shared/config/labels';
import { trackEvent } from '@/shared/lib/analytics/events';

type TranslationMap = Record<string, Partial<Record<Locale, string>>>;

function decodeSegment(segment: string) {
  try {
    return decodeURIComponent(segment);
  } catch {
    return segment;
  }
}

export function LocaleSwitch({
  locale,
  translations = {},
  targetTags = [],
}: {
  locale: Locale;
  translations?: TranslationMap;
  targetTags?: string[];
}) {
  const pathname = usePathname();
  const router = useRouter();
  const [noticeHref, setNoticeHref] = useState<string | null>(null);
  const next = locale === 'ko' ? 'en' : 'ko';
  const t = labels(locale);
  const handleNavigate = (targetPathname: string) => {
    const url = new URL(window.location.href);
    url.pathname = targetPathname;
    trackEvent('language_changed', { from_locale: locale, to_locale: next });
    router.push(`${url.pathname}${url.search}${url.hash}`);
  };
  return (
    <div className="locale-switch">
      <button
        type="button"
        className="locale-button"
        onClick={() => {
          const parts = pathname.split('/').filter(Boolean);
          if (parts[1] === 'blog' && parts.length === 3) {
            const slug = decodeSegment(parts[2] ?? '');
            const translated = translations[slug]?.[next];
            if (!translated) {
              const url = new URL(window.location.href);
              url.pathname = `/${next}/blog`;
              setNoticeHref(`${url.pathname}${url.search}${url.hash}`);
              return;
            }
            handleNavigate(`/${next}/blog/${translated}`);
            return;
          }
          if (
            parts[1] === 'blog' &&
            parts[2] === 'tag' &&
            !targetTags.includes(decodeSegment(parts[3] ?? ''))
          ) {
            handleNavigate(`/${next}/blog`);
            return;
          }
          handleNavigate(pathname.replace(/^\/(ko|en)(?=\/|$)/, `/${next}`));
        }}
        aria-label={`${t.nav.language}: ${next.toUpperCase()} (${t.nav.languages[next]})`}
        aria-expanded={Boolean(noticeHref)}
      >
        {next.toUpperCase()}
      </button>
      {noticeHref && (
        <div className="locale-notice" role="status">
          <p>{t.common.translationMissing}</p>
          <Link
            href={noticeHref}
            onClick={() => {
              trackEvent('language_changed', { from_locale: locale, to_locale: next });
            }}
            onNavigate={() => setNoticeHref(null)}
          >
            {t.common.translationList}
          </Link>
          <button
            type="button"
            className="notice-close"
            onClick={() => setNoticeHref(null)}
            aria-label={t.common.close}
          >
            ×
          </button>
        </div>
      )}
    </div>
  );
}
