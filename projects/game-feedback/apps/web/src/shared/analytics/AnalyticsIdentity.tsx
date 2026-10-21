'use client';

import { useEffect, useRef } from 'react';

import { ANALYTICS_EVENT } from './analytics.catalog';
import { identifyUser, resetAnalytics, trackEvent } from './analytics.store';
import { consumePendingLogin, markPendingOnboarding } from './login-marker';

export function AnalyticsIdentity({
  userId,
  needsOnboarding,
}: {
  userId?: string;
  needsOnboarding: boolean;
}) {
  const previous = useRef<string | undefined>(undefined);
  useEffect(() => {
    if (needsOnboarding) markPendingOnboarding();
    if (previous.current && previous.current !== userId) resetAnalytics();
    if (!userId) {
      resetAnalytics();
      previous.current = undefined;
      return;
    }
    identifyUser(userId);
    if (previous.current !== userId) {
      const marker = consumePendingLogin();
      if (marker)
        trackEvent(marker.onboarding ? ANALYTICS_EVENT.SignupCompleted : ANALYTICS_EVENT.LoginSucceeded, {
          provider: marker.provider,
        });
    }
    previous.current = userId;
  }, [userId, needsOnboarding]);
  return null;
}
