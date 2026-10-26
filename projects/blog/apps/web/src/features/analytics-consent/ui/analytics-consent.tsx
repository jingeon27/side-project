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
import { requiresOptIn } from '@/shared/lib/analytics/region';

export function AnalyticsConsent({ locale }: { locale: Locale }) {
  const [opened, setOpened] = useState(false);
  const [dismissed, setDismissed] = useState(false);
  const status = useSyncExternalStore(subscribe, getConsentStatus, () => 'unavailable');
  const visible = opened || (status === 'unknown' && !dismissed);
  const text = labels(locale);

  // 서버 렌더링과 막힌 저장소에서는 설정 버튼도 내보내지 않는다.
  if (!analyticsConfigured || status === 'unavailable') return null;
  const optIn = requiresOptIn();
  function close() {
    setOpened(false);
    setDismissed(true);
  }
  function choose(choice: TAnalyticsChoice) {
    setAnalyticsConsent(choice);
    close();
  }
  // 고르기 전에는 유럽 방문자는 모두 꺼져 있고 그 밖의 방문자는 방문 통계가 켜져 있으므로 실제 상태를 표시한다.
  const current = status === 'unknown' ? (optIn ? 'denied' : 'statistics') : status;

  return (
    <>
      <button type="button" className="analytics-settings" onClick={() => setOpened(true)}>
        {text.analytics.preferences}
      </button>
      {visible && (
        <aside className="analytics-consent" aria-label={text.analytics.title}>
          <strong>{text.analytics.title}</strong>
          <p>{optIn ? text.analytics.optInMessage : text.analytics.message}</p>
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
