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
  const track = useEffectEvent(() => trackPageView(pathname));
  const syncConsent = useEffectEvent((event: StorageEvent) => {
    if (event.key !== consentKey && event.key !== null) return;
    applyAnalyticsConsent();
    trackPageView(pathname);
  });

  useEffect(() => {
    trackPageView(pathname);
  }, [pathname]);

  useEffect(() => {
    window.addEventListener(consentChangedEvent, track);
    window.addEventListener('storage', syncConsent);
    return () => {
      window.removeEventListener(consentChangedEvent, track);
      window.removeEventListener('storage', syncConsent);
    };
  }, []);
  return null;
}
