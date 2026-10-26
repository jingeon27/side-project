'use client';

import { useState, useSyncExternalStore } from 'react';

import type { Locale } from '@/i18n/routing';
import { labels } from '@/shared/config/labels';
import {
  analyticsConfigured,
  analyticsConsent,
  consentChangedEvent,
  consentKey,
  setAnalyticsConsent,
  type TAnalyticsChoice,
} from '@/shared/lib/analytics/events';
import { isTrackedRegion } from '@/shared/lib/analytics/region';

export function AnalyticsConsent({ locale }: { locale: Locale }) {
  const [opened, setOpened] = useState(false);
  const [dismissed, setDismissed] = useState(false);
  const status = useSyncExternalStore(subscribe, getConsentStatus, () => 'unavailable');
  const visible = opened || (status === 'unknown' && !dismissed);
  const text = labels(locale);

  // 해외 방문자·서버 렌더링·막힌 저장소에서는 설정 버튼도 내보내지 않는다.
  if (!analyticsConfigured || status === 'unavailable') return null;
  function close() {
    setOpened(false);
    setDismissed(true);
  }
  function choose(choice: TAnalyticsChoice) {
    setAnalyticsConsent(choice);
    close();
  }
  // 고르지 않은 방문자도 방문 통계는 켜져 있으므로 그 상태를 그대로 표시한다.
  const current = status === 'unknown' ? 'statistics' : status;

  return (
    <>
      <button type="button" className="analytics-settings" onClick={() => setOpened(true)}>
        {text.analytics.preferences}
      </button>
      {visible && (
        <aside className="analytics-consent" aria-label={text.analytics.title}>
          <strong>{text.analytics.title}</strong>
          <p>{text.analytics.message}</p>
          <a className="analytics-consent-privacy" href={`/${locale}/privacy`}>
            {text.privacy.title}
          </a>
          <div className="analytics-consent-actions">
            <button type="button" aria-pressed={current === 'granted'} onClick={() => choose('granted')}>
              {text.analytics.allow}
            </button>
            <button
              type="button"
              aria-pressed={current === 'statistics'}
              onClick={() => choose('statistics')}
            >
              {text.analytics.statistics}
            </button>
            <button type="button" aria-pressed={current === 'denied'} onClick={() => choose('denied')}>
              {text.analytics.deny}
            </button>
            <button type="button" onClick={close} aria-label={text.analytics.close}>
              ×
            </button>
          </div>
        </aside>
      )}
    </>
  );
}

function getConsentStatus() {
  if (!isTrackedRegion()) return 'unavailable';
  try {
    localStorage.getItem(consentKey);
  } catch {
    return 'unavailable';
  }
  return analyticsConsent();
}

function subscribe(callback: () => void) {
  window.addEventListener(consentChangedEvent, callback);
  window.addEventListener('storage', callback);
  return () => {
    window.removeEventListener(consentChangedEvent, callback);
    window.removeEventListener('storage', callback);
  };
}
