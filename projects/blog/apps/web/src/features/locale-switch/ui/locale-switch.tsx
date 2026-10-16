'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useState } from 'react';
import { labels, type UiLocale } from '@/shared/config/labels';
import { trackEvent } from '@/shared/lib/analytics/events';

type TranslationMap = Record<string, Partial<Record<UiLocale, string>>>;

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
  locale: UiLocale;
  translations?: TranslationMap;
  targetTags?: string[];
}) {
  const pathname = usePathname();
  const router = useRouter();
  const [notice, setNotice] = useState(false);
  const next = locale === 'ko' ? 'en' : 'ko';
  const t = labels(locale);
  function changeLocale() {
    const parts = pathname.split('/').filter(Boolean);
    if (parts[1] === 'blog' && parts.length === 3) {
      const slug = decodeSegment(parts[2] ?? '');
      const translated = translations[slug]?.[next];
      if (!translated) {
        setNotice(true);
        return;
      }
      trackEvent('language_changed', { from_locale: locale, to_locale: next });
      router.push(`/${next}/blog/${translated}`);
      return;
    }
    if (parts[1] === 'blog' && parts[2] === 'tag' && !targetTags.includes(decodeSegment(parts[3] ?? ''))) {
      trackEvent('language_changed', { from_locale: locale, to_locale: next });
      router.push(`/${next}/blog`);
      return;
    }
    trackEvent('language_changed', { from_locale: locale, to_locale: next });
    router.push(pathname.replace(/^\/(ko|en)(?=\/|$)/, `/${next}`));
  }
  return (
    <div className="locale-switch">
      <button
        type="button"
        className="locale-button"
        onClick={changeLocale}
        aria-label={`${t.nav.language}: ${next.toUpperCase()} (${next === 'ko' ? '한국어' : 'English'})`}
        aria-expanded={notice}
      >
        {next.toUpperCase()}
        <span aria-hidden="true">↗</span>
      </button>
      {notice && (
        <div className="locale-notice" role="status">
          <p>{t.common.translationMissing}</p>
          <Link
            href={`/${next}/blog`}
            onClick={() => {
              trackEvent('language_changed', { from_locale: locale, to_locale: next });
              setNotice(false);
            }}
          >
            {t.common.translationList} →
          </Link>
          <button
            type="button"
            className="notice-close"
            onClick={() => setNotice(false)}
            aria-label={t.common.close}
          >
            ×
          </button>
        </div>
      )}
    </div>
  );
}
