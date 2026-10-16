'use client';

import { useState, useSyncExternalStore } from 'react';
import type { Locale } from '@/i18n/routing';
import { labels } from '@/shared/config/labels';
import {
  analyticsConfigured,
  consentChangedEvent,
  consentKey,
  setAnalyticsConsent,
} from '@/shared/lib/analytics/events';

export function AnalyticsConsent({ locale }: { locale: Locale }) {
  const [opened, setOpened] = useState(false);
  const [dismissed, setDismissed] = useState(false);
  const status = useSyncExternalStore(subscribe, getConsentStatus, () => 'unavailable');
  const granted = status === 'granted';
  const visible = opened || (status === 'unknown' && !dismissed);
  const text = labels(locale).analytics;

  if (!analyticsConfigured) return null;
  function choose(value: boolean) {
    setAnalyticsConsent(value);
    setOpened(false);
    setDismissed(true);
  }

  return (
    <>
      <button type="button" className="analytics-settings" onClick={() => setOpened(true)}>
        {text.preferences}
      </button>
      {visible && (
        <aside className="analytics-consent" aria-label={text.title}>
          <strong>{text.title}</strong>
          <p>{text.message}</p>
          <div className="analytics-consent-actions">
            <button type="button" onClick={() => choose(true)}>
              {text.allow}
            </button>
            <button type="button" onClick={() => choose(false)}>
              {granted ? text.revoke : text.deny}
            </button>
            <button
              type="button"
              onClick={() => {
                setOpened(false);
                setDismissed(true);
              }}
              aria-label={text.close}
            >
              ×
            </button>
          </div>
        </aside>
      )}
    </>
  );
}

function getConsentStatus() {
  try {
    return localStorage.getItem(consentKey) || 'unknown';
  } catch {
    return 'unavailable';
  }
}

function subscribe(callback: () => void) {
  window.addEventListener(consentChangedEvent, callback);
  window.addEventListener('storage', callback);
  return () => {
    window.removeEventListener(consentChangedEvent, callback);
    window.removeEventListener('storage', callback);
  };
}
