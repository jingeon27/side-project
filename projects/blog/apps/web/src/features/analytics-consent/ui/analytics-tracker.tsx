'use client';

import { useEffect } from 'react';
import { usePathname } from 'next/navigation';
import { consentChangedEvent, trackPageView } from '@/shared/lib/analytics/events';

export function AnalyticsTracker() {
  const pathname = usePathname();
  useEffect(() => {
    const track = () => trackPageView(pathname);
    track();
    window.addEventListener(consentChangedEvent, track);
    return () => window.removeEventListener(consentChangedEvent, track);
  }, [pathname]);
  return null;
}
