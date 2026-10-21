'use client';

import { useEffect } from 'react';
import { usePathname } from 'next/navigation';

import { ANALYTICS_EVENT, initAnalytics, toPathTemplate, trackEvent } from '@/shared/model/analytics';
import { useBridge } from '@/shared/model/bridge';

/**
 * 분석 도구를 브라우저에서 한 번 초기화하고(키가 없으면 아무것도 보내지 않는다), 경로가 바뀔 때마다
 * ID를 지운 경로 이름표로 page_viewed를 보낸다. 앱 WebView 안이면 앱이 넘긴 기기 ID를 쓴다.
 */
export function AnalyticsTracker() {
  const bridge = useBridge();
  const pathname = usePathname();

  // 같은 컴포넌트의 effect는 선언 순서대로 돌므로 초기화가 첫 page_viewed보다 먼저다.
  useEffect(() => {
    initAnalytics({ apiKey: process.env.NEXT_PUBLIC_AMPLITUDE_API_KEY, app: bridge?.app ?? null });
  }, [bridge]);

  useEffect(() => {
    trackEvent(ANALYTICS_EVENT.PageViewed, { path_template: toPathTemplate(pathname) });
  }, [pathname]);

  return null;
}
