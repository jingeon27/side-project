'use client';

import { useSyncExternalStore } from 'react';

import type { Locale } from '@/i18n/routing';
import { labels } from '@/shared/config/labels';
import {
  analyticsConfigured,
  analyticsOptedOut,
  consentChangedEvent,
  consentKey,
  setAnalyticsOptOut,
} from '@/shared/lib/analytics/events';

/** 개인정보 처리 안내에서 이 브라우저의 수집을 끄거나 다시 켠다. 배너 없이 이 페이지에서만 바꾼다. */
export function AnalyticsOptOut({ locale }: { locale: Locale }) {
  const status = useSyncExternalStore(subscribe, getStatus, () => 'unavailable');
  // 서버 렌더링, 분석 ID가 없는 빌드, 막힌 저장소에서는 바꿀 것이 없다.
  if (!analyticsConfigured || status === 'unavailable') return null;
  const text = labels(locale).analytics;
  const optedOut = status === 'off';
  return (
    <div className="analytics-opt-out">
      <p role="status">{optedOut ? text.off : text.on}</p>
      <button type="button" onClick={() => setAnalyticsOptOut(!optedOut)}>
        {optedOut ? text.enable : text.disable}
      </button>
    </div>
  );
}

function getStatus() {
  try {
    localStorage.getItem(consentKey);
  } catch {
    return 'unavailable';
  }
  return analyticsOptedOut() ? 'off' : 'on';
}

function subscribe(callback: () => void) {
  window.addEventListener(consentChangedEvent, callback);
  window.addEventListener('storage', callback);
  return () => {
    window.removeEventListener(consentChangedEvent, callback);
    window.removeEventListener('storage', callback);
  };
}
