'use client';

import { useSyncExternalStore } from 'react';
import { labels, type UiLocale } from '@/shared/config/labels';

function subscribe(callback: () => void) {
  window.addEventListener('blog-theme-change', callback);
  return () => window.removeEventListener('blog-theme-change', callback);
}
const getTheme = () => (document.documentElement.dataset.theme === 'dark' ? 'dark' : 'light');

export function ThemeSwitch({ locale }: { locale: UiLocale }) {
  const theme = useSyncExternalStore(subscribe, getTheme, () => 'light');
  function toggle() {
    const next = theme === 'dark' ? 'light' : 'dark';
    document.documentElement.dataset.theme = next;
    document.documentElement.style.colorScheme = next;
    try {
      localStorage.setItem('blog-theme', next);
    } catch {
      /* Reading works without storage. */
    }
    window.dispatchEvent(new Event('blog-theme-change'));
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
