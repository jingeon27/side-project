'use client';

import { useLayoutEffect, useSyncExternalStore } from 'react';
import { usePathname } from 'next/navigation';

import { labels, type UiLocale } from '@/shared/config/labels';

type Theme = 'light' | 'dark';

function getPreferredTheme(): Theme {
  try {
    const saved = localStorage.getItem('blog-theme');
    if (saved === 'light' || saved === 'dark') return saved;
  } catch {
    /* Use the current document or system preference when storage is unavailable. */
  }
  const current = document.documentElement.dataset.theme;
  if (current === 'light' || current === 'dark') return current;
  return window.matchMedia?.('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

function applyTheme(theme: Theme) {
  document.documentElement.dataset.theme = theme;
  document.documentElement.style.colorScheme = theme;
  window.dispatchEvent(new Event('blog-theme-change'));
}

function subscribe(callback: () => void) {
  window.addEventListener('blog-theme-change', callback);
  return () => window.removeEventListener('blog-theme-change', callback);
}
const getTheme = () => (document.documentElement.dataset.theme === 'dark' ? 'dark' : 'light');

export function ThemeSwitch({ locale }: { locale: UiLocale }) {
  const pathname = usePathname();
  const theme = useSyncExternalStore(subscribe, getTheme, () => 'light');
  useLayoutEffect(() => {
    // Locale navigation replaces document attributes without rerunning the initial theme script.
    applyTheme(getPreferredTheme());
  }, [locale, pathname]);

  function toggle() {
    const next = theme === 'dark' ? 'light' : 'dark';
    try {
      localStorage.setItem('blog-theme', next);
    } catch {
      /* Reading works without storage. */
    }
    applyTheme(next);
  }
  return (
    <button
      type="button"
      className="icon-button theme-switch"
      onClick={toggle}
      aria-label={labels(locale).nav.theme}
      aria-pressed={theme === 'dark'}
    >
      <svg
        width="18"
        height="18"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
      >
        {theme === 'dark' ? (
          <path d="M20.5 13.3A8.5 8.5 0 0 1 10.7 3.5a8.5 8.5 0 1 0 9.8 9.8Z" />
        ) : (
          <>
            <circle cx="12" cy="12" r="4" />
            <path d="M12 2v2m0 16v2M2 12h2m16 0h2M5 5l1.5 1.5m11 11L19 19M5 19l1.5-1.5m11-11L19 5" />
          </>
        )}
      </svg>
    </button>
  );
}
