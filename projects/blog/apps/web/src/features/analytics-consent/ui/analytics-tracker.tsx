'use client';

import { useEffect } from 'react';
import { usePathname } from 'next/navigation';

import {
  applyAnalyticsConsent,
  consentChangedEvent,
  consentKey,
  trackPageView,
} from '@/shared/lib/analytics/events';

export function AnalyticsTracker() {
  const pathname = usePathname();
  useEffect(() => {
    const track = () => trackPageView(pathname);
    track();
    // 다른 탭에서 바꾼 선택을 이 탭의 수집 상태에도 반영한다.
    const syncConsent = (event: StorageEvent) => {
      if (event.key !== consentKey && event.key !== null) return;
      applyAnalyticsConsent();
      track();
    };
    window.addEventListener(consentChangedEvent, track);
    window.addEventListener('storage', syncConsent);
    return () => {
      window.removeEventListener(consentChangedEvent, track);
      window.removeEventListener('storage', syncConsent);
    };
  }, [pathname]);
  return null;
}
