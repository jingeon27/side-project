'use client';

import { useEffect, useEffectEvent } from 'react';
import { usePathname } from 'next/navigation';

import {
  applyAnalyticsConsent,
  consentChangedEvent,
  consentKey,
  trackPageView,
} from '@/shared/lib/analytics/events';

export function AnalyticsTracker() {
  const pathname = usePathname();
  const handleConsentChange = useEffectEvent(() => trackPageView(pathname));
  const handleStorage = useEffectEvent((event: StorageEvent) => {
    if (event.key !== consentKey && event.key !== null) return;
    applyAnalyticsConsent();
    trackPageView(pathname);
  });

  useEffect(() => {
    trackPageView(pathname);
  }, [pathname]);

  useEffect(() => {
    window.addEventListener(consentChangedEvent, handleConsentChange);
    window.addEventListener('storage', handleStorage);
    return () => {
      window.removeEventListener(consentChangedEvent, handleConsentChange);
      window.removeEventListener('storage', handleStorage);
    };
  }, []);
  return null;
}
