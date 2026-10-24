'use client';

import { useEffect } from 'react';
import { usePathname } from 'next/navigation';

import {
  consentChangedEvent,
  consentKey,
  hasAnalyticsConsent,
  setAnalyticsConsent,
  trackPageView,
} from '@/shared/lib/analytics/events';

export function AnalyticsTracker() {
  const pathname = usePathname();
  useEffect(() => {
    const track = () => trackPageView(pathname);
    track();
    const syncConsent = (event: StorageEvent) => {
      if (event.key === consentKey || event.key === null) setAnalyticsConsent(hasAnalyticsConsent());
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
